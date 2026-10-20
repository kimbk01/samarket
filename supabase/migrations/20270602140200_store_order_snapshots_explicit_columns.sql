-- 배달 오너 감사 ORD-07 ⊃ DLV-04 (문서 G-1 §4-G, Owner 승인 1단계) — 정보 노출
-- 원인: 오너·구매자 주문 스냅샷 RPC 가 store_orders / store_order_deliveries 전체 행(to_jsonb(o.*), to_jsonb(d.*))을 반환해
--       관리자 내부 메모(admin_note)·분쟁·관리자 플래그·수수료 기준액·매장 부담액·배달 증빙 경로/URL·증빙·실패 좌표가
--       오너·구매자 응답에 포함됨. 오너 목록 RPC 도 admin_note·admin_flagged·dispute_status 를 선택.
-- 수정: 세 함수를 명시 컬럼 목록으로 재정의 (운영 원문 pg_get_functiondef 2026-10-21 PHT 기준, R-DB-1).
--   - get_owner_store_orders_list_snapshot: 20270602110000 의 미종료 주문 포함(open_rows) 그대로 유지,
--     출력에서 admin_note·admin_flagged·dispute_status 만 제거 (admin_locked·needs_admin_attention 유지 — 화면 사용).
--   - get_owner_store_order_detail_snapshot: order = 명시 컬럼(관리자 메모·분쟁·플래그·외부배달 원문 meta·구매자 멱등키 제외,
--     매장 자신의 금액 컬럼은 유지), delivery = 명시 컬럼(증빙 URL/경로·증빙/실패 좌표·admin_note 제외).
--   - get_buyer_store_order_detail_snapshot: order = 명시 컬럼(위 + 수수료 기준액·매장/플랫폼 부담액 제외),
--     items = 명시 컬럼, delivery = 명시 컬럼(라이더 내부 사유·메모 추가 제외. 수령인 이름은 웹에서 마스킹).
--   웹 방어 이중화: lib/stores/store-order-detail-snapshot-assemble.ts (stripStoreOrderDeliveryForClient).
-- 관리자 상세는 별도 관리자 경로(/api/admin/store-orders/[orderId]/detail)라 전체 표시 그대로.
-- get_store_order_detail_snapshot(구매자 통합 RPC)은 get_buyer_store_order_detail_snapshot 을 감싸므로 자동 반영.
-- 데이터 변경 없음 (D-5). 함수 본문에는 비 ASCII 주석을 넣지 않는다.
-- 롤백: 목록 = 20270602110000 의 get_owner_store_orders_list_snapshot 재적용,
--       상세 2개 = 파일 하단 주석의 운영 직전 요지(to_jsonb(o.*)/to_jsonb(d.*)/to_jsonb(i.*))로 CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_owner_store_orders_list_snapshot(
  p_store_id uuid,
  p_owner_user_id uuid,
  p_status text DEFAULT '',
  p_limit integer DEFAULT 60,
  p_cursor text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_store_ok boolean := false;
  v_limit integer := greatest(1, least(120, coalesce(p_limit, 60)));
  v_status text := coalesce(trim(p_status), '');
  v_cursor text := coalesce(trim(p_cursor), '');
  v_cursor_created timestamptz;
  v_cursor_id uuid;
  v_dash jsonb;
  v_reviews_exist boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = p_store_id AND s.owner_user_id = p_owner_user_id
  ) INTO v_store_ok;

  IF NOT v_store_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden', 'updated_at', now());
  END IF;

  SELECT to_regclass('public.store_reviews') IS NOT NULL INTO v_reviews_exist;

  IF v_cursor <> '' THEN
    BEGIN
      v_cursor_created := split_part(v_cursor, '|', 1)::timestamptz;
      v_cursor_id := split_part(v_cursor, '|', 2)::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_cursor_created := NULL;
      v_cursor_id := NULL;
    END;
  END IF;

  v_dash := public.get_owner_store_ops_dashboard_snapshot(p_store_id, p_owner_user_id);

  RETURN (
    WITH store_addr AS (
      SELECT region, city, district, address_line1, address_line2
      FROM public.stores
      WHERE id = p_store_id
      LIMIT 1
    ),
    order_rows AS (
      SELECT o.*
      FROM public.store_orders o
      WHERE o.store_id = p_store_id
        AND (v_status = '' OR o.order_status = v_status)
        AND (
          v_cursor_created IS NULL
          OR o.created_at < v_cursor_created
          OR (o.created_at = v_cursor_created AND o.id < v_cursor_id)
        )
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT v_limit + 1
    ),
    win_rows AS (
      SELECT * FROM order_rows LIMIT v_limit
    ),
    open_rows AS (
      SELECT o.*
      FROM public.store_orders o
      WHERE v_status = ''
        AND v_cursor_created IS NULL
        AND o.store_id = p_store_id
        AND o.order_status IN (
          'pending', 'accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived',
          'cancel_requested', 'refund_requested'
        )
        AND NOT EXISTS (SELECT 1 FROM win_rows w WHERE w.id = o.id)
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 300
    ),
    page_rows AS (
      SELECT * FROM win_rows
      UNION ALL
      SELECT * FROM open_rows
    ),
    next_row AS (
      SELECT created_at, id FROM order_rows OFFSET v_limit LIMIT 1
    ),
    items_agg AS (
      SELECT
        i.order_id,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'order_id', i.order_id,
              'product_id', i.product_id,
              'product_title_snapshot', i.product_title_snapshot,
              'price_snapshot', i.price_snapshot,
              'qty', i.qty,
              'subtotal', i.subtotal,
              'options_snapshot_json', i.options_snapshot_json
            )
            ORDER BY i.id
          ),
          '[]'::jsonb
        ) AS items
      FROM public.store_order_items i
      WHERE i.order_id IN (SELECT id FROM page_rows)
      GROUP BY i.order_id
    ),
    review_ids AS (
      SELECT r.order_id
      FROM public.store_reviews r
      WHERE v_reviews_exist
        AND r.order_id IN (SELECT id FROM page_rows)
    ),
    orders_json AS (
      SELECT coalesce(
        jsonb_agg(
          to_jsonb(pr) - 'buyer_user_id_raw' - 'display_name' - 'nickname' - 'username'
          || jsonb_build_object(
            'buyer_user_id', pr.buyer_user_id_raw,
            'buyer_public_label', public.owner_orders_list_buyer_public_label(pr.display_name, pr.nickname, pr.username),
            'items', coalesce(ia.items, '[]'::jsonb),
            'review_status',
              CASE
                WHEN pr.order_status <> 'completed' THEN 'not_applicable'
                WHEN v_reviews_exist AND ri.order_id IS NOT NULL THEN 'completed'
                WHEN NOT v_reviews_exist THEN 'unavailable'
                ELSE 'pending'
              END
          )
          ORDER BY pr.created_at DESC, pr.id DESC
        ),
        '[]'::jsonb
      ) AS orders
      FROM (
        SELECT
          o.id,
          o.order_no,
          o.buyer_user_id AS buyer_user_id_raw,
          o.total_amount,
          o.payment_amount,
          o.delivery_fee_amount,
          o.delivery_courier_label,
          o.payment_status,
          o.order_status,
          o.fulfillment_type,
          o.buyer_note,
          o.buyer_phone,
          o.buyer_payment_method,
          o.buyer_payment_method_detail,
          o.delivery_address_summary,
          o.delivery_address_detail,
          o.delivery_user_address_id,
          o.delivery_place_id,
          o.delivery_formatted_address,
          o.delivery_detail_address,
          o.delivery_note,
          o.delivery_latitude,
          o.delivery_longitude,
          o.created_at,
          o.updated_at,
          o.auto_complete_at,
          o.community_messenger_room_id,
          o.estimated_prep_minutes,
          o.estimated_ready_at,
          o.accepted_at,
          o.admin_locked,
          o.sla_warning_level,
          o.sla_warning_reason,
          o.sla_warning_at,
          o.needs_admin_attention,
          o.checkout_prep_minutes,
          o.checkout_ride_minutes,
          o.checkout_eta_minutes,
          o.checkout_eta_computed_at,
          o.checkout_route_distance_meters,
          o.checkout_straight_distance_meters,
          p.display_name,
          p.nickname,
          p.username
        FROM page_rows o
        LEFT JOIN public.profiles p ON p.id = o.buyer_user_id
      ) pr
      LEFT JOIN items_agg ia ON ia.order_id = pr.id
      LEFT JOIN review_ids ri ON ri.order_id = pr.id
    )
    SELECT jsonb_build_object(
      'ok', true,
      'orders', (SELECT orders FROM orders_json),
      'next_cursor', (
        SELECT CASE
          WHEN nr.id IS NULL THEN null
          ELSE to_char(nr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || nr.id::text
        END
        FROM next_row nr
      ),
      'status_counts_optional', jsonb_build_object(
        'pending_accept_count', coalesce((v_dash->>'pending_accept_count')::int, 0),
        'refund_requested_count', coalesce((v_dash->>'refund_requested_count')::int, 0),
        'pending_delivery_count', coalesce((v_dash->>'pending_delivery_count')::int, 0)
      ),
      'store_pickup_address', (SELECT to_jsonb(sa) FROM store_addr sa),
      'updated_at', now()
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text) TO service_role;


CREATE OR REPLACE FUNCTION public.get_owner_store_order_detail_snapshot(
  p_user_id uuid,
  p_store_id uuid,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
  v_order jsonb;
  v_items jsonb;
  v_store jsonb;
  v_delivery jsonb;
  v_review jsonb;
  v_review_status text;
  v_status text;
BEGIN
  SELECT s.owner_user_id
  INTO v_owner
  FROM public.stores AS s
  WHERE s.id = p_store_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  IF v_owner IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- explicit owner-visible order columns (no admin_note / admin_flagged / dispute_status /
  -- external_delivery_meta / client_order_key)
  SELECT to_jsonb(x)
  INTO v_order
  FROM (
    SELECT
      o.id, o.order_no, o.buyer_user_id, o.store_id,
      o.total_amount, o.discount_amount, o.payment_amount, o.payment_status, o.order_status,
      o.fulfillment_type, o.buyer_note, o.created_at, o.updated_at, o.auto_complete_at,
      o.buyer_phone, o.delivery_fee_amount, o.delivery_courier_label,
      o.delivery_address_summary, o.delivery_address_detail,
      o.buyer_payment_method, o.buyer_payment_method_detail,
      o.external_delivery_provider, o.external_delivery_order_id, o.external_delivery_status,
      o.external_delivery_updated_at,
      o.community_messenger_room_id, o.estimated_prep_minutes, o.estimated_ready_at, o.accepted_at,
      o.admin_locked, o.refund_approved_at, o.refunded_at,
      o.sla_warning_level, o.sla_warning_reason, o.sla_warning_at, o.needs_admin_attention,
      o.delivery_region, o.delivery_city,
      o.checkout_prep_minutes, o.checkout_ride_minutes, o.checkout_eta_minutes, o.checkout_eta_computed_at,
      o.delivery_user_address_id, o.checkout_route_distance_meters,
      o.delivery_place_id, o.delivery_formatted_address, o.delivery_detail_address, o.delivery_note,
      o.delivery_latitude, o.delivery_longitude, o.checkout_straight_distance_meters,
      o.coupon_campaign_id, o.user_coupon_id,
      o.store_funded_amount, o.platform_funded_amount, o.commission_base_amount,
      o.coupon_offer_title, o.coupon_number, o.gift_redemption_amount, o.amount_before_gift,
      o.checkout_store_latitude, o.checkout_store_longitude,
      o.checkout_serviceability_eligible, o.checkout_serviceability_max_km, o.checkout_serviceability_reason
    FROM public.store_orders AS o
    WHERE o.id = p_order_id
      AND o.store_id = p_store_id
  ) AS x;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'order_id', i.order_id,
        'product_id', i.product_id,
        'product_title_snapshot', i.product_title_snapshot,
        'price_snapshot', i.price_snapshot,
        'qty', i.qty,
        'subtotal', i.subtotal,
        'options_snapshot_json', i.options_snapshot_json
      )
      ORDER BY i.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.store_order_items AS i
  WHERE i.order_id = p_order_id;

  SELECT jsonb_build_object(
    'store_name', s.store_name,
    'slug', s.slug,
    'profile_image_url', s.profile_image_url,
    'region', s.region,
    'city', s.city,
    'district', s.district,
    'address_line1', s.address_line1,
    'address_line2', s.address_line2
  )
  INTO v_store
  FROM public.stores AS s
  WHERE s.id = p_store_id;

  -- explicit delivery columns (no proof image url/path, no proof/failure coordinates, no admin_note)
  SELECT to_jsonb(x)
  INTO v_delivery
  FROM (
    SELECT
      d.order_id, d.store_id, d.buyer_user_id, d.rider_id, d.delivery_status,
      d.assigned_at, d.picked_up_at, d.delivered_at, d.created_at, d.updated_at,
      d.rider_accepted_at, d.customer_arrived_at, d.rider_decline_reason,
      d.delivered_proof_note, d.delivered_receiver_name, d.delivered_confirmed_at,
      d.failure_note, d.rider_failure_reported_at, d.rider_failure_report_reason, d.failed_at
    FROM public.store_order_deliveries AS d
    WHERE d.order_id = p_order_id
  ) AS x;

  SELECT to_jsonb(r.*)
  INTO v_review
  FROM public.store_reviews AS r
  WHERE r.order_id = p_order_id
  LIMIT 1;

  v_status := coalesce(v_order->>'order_status', '');
  IF v_status <> 'completed' THEN
    v_review_status := 'not_applicable';
    v_review := NULL;
  ELSIF v_review IS NOT NULL THEN
    v_review_status := 'completed';
  ELSE
    v_review_status := 'pending';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'store', coalesce(v_store, '{}'::jsonb),
    'order', v_order,
    'items', v_items,
    'delivery', v_delivery,
    'review_status', v_review_status,
    'review', v_review
  );
EXCEPTION
  WHEN undefined_table THEN
    RETURN jsonb_build_object('ok', false, 'error', 'schema_incomplete');
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_owner_store_order_detail_snapshot(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_store_order_detail_snapshot(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_buyer_store_order_detail_snapshot(
  p_user_id uuid,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order jsonb;
  v_store_id uuid;
  v_items jsonb;
  v_store jsonb;
  v_delivery jsonb;
  v_review jsonb;
  v_hidden boolean := false;
BEGIN
  BEGIN
    SELECT EXISTS (
      SELECT 1
      FROM public.store_order_buyer_hides AS h
      WHERE h.buyer_user_id = p_user_id
        AND h.order_id = p_order_id
    )
    INTO v_hidden;
  EXCEPTION
    WHEN undefined_table THEN
      v_hidden := false;
  END;

  IF v_hidden THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- explicit buyer-visible order columns (no admin / dispute / commission / store-funding columns)
  SELECT to_jsonb(x)
  INTO v_order
  FROM (
    SELECT
      o.id, o.order_no, o.buyer_user_id, o.store_id,
      o.total_amount, o.discount_amount, o.payment_amount, o.payment_status, o.order_status,
      o.fulfillment_type, o.buyer_note, o.created_at, o.updated_at, o.auto_complete_at,
      o.buyer_phone, o.delivery_fee_amount, o.delivery_courier_label,
      o.delivery_address_summary, o.delivery_address_detail,
      o.buyer_payment_method, o.buyer_payment_method_detail,
      o.external_delivery_provider, o.external_delivery_order_id, o.external_delivery_status,
      o.external_delivery_updated_at,
      o.community_messenger_room_id, o.estimated_prep_minutes, o.estimated_ready_at, o.accepted_at,
      o.admin_locked, o.refund_approved_at, o.refunded_at,
      o.sla_warning_level, o.sla_warning_reason, o.sla_warning_at, o.needs_admin_attention,
      o.client_order_key, o.delivery_region, o.delivery_city,
      o.checkout_prep_minutes, o.checkout_ride_minutes, o.checkout_eta_minutes, o.checkout_eta_computed_at,
      o.delivery_user_address_id, o.checkout_route_distance_meters,
      o.delivery_place_id, o.delivery_formatted_address, o.delivery_detail_address, o.delivery_note,
      o.delivery_latitude, o.delivery_longitude, o.checkout_straight_distance_meters,
      o.coupon_campaign_id, o.user_coupon_id,
      o.coupon_offer_title, o.coupon_number, o.gift_redemption_amount, o.amount_before_gift,
      o.checkout_store_latitude, o.checkout_store_longitude,
      o.checkout_serviceability_eligible, o.checkout_serviceability_max_km, o.checkout_serviceability_reason
    FROM public.store_orders AS o
    WHERE o.id = p_order_id
      AND o.buyer_user_id = p_user_id
  ) AS x;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_store_id := (v_order->>'store_id')::uuid;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'order_id', i.order_id,
        'product_id', i.product_id,
        'product_title_snapshot', i.product_title_snapshot,
        'price_snapshot', i.price_snapshot,
        'qty', i.qty,
        'subtotal', i.subtotal,
        'options_snapshot_json', i.options_snapshot_json,
        'base_price_snapshot', i.base_price_snapshot,
        'options_unit_delta_snapshot', i.options_unit_delta_snapshot
      )
      ORDER BY i.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.store_order_items AS i
  WHERE i.order_id = p_order_id;

  SELECT jsonb_build_object(
    'store_name', s.store_name,
    'slug', s.slug,
    'owner_user_id', s.owner_user_id,
    'region', s.region,
    'city', s.city,
    'district', s.district,
    'address_line1', s.address_line1,
    'address_line2', s.address_line2
  )
  INTO v_store
  FROM public.stores AS s
  WHERE s.id = v_store_id;

  -- explicit buyer delivery columns (no proof url/path, no coordinates, no admin_note,
  -- no rider-internal decline/failure reasons or notes; receiver name is masked in the web layer)
  SELECT to_jsonb(x)
  INTO v_delivery
  FROM (
    SELECT
      d.order_id, d.store_id, d.buyer_user_id, d.rider_id, d.delivery_status,
      d.assigned_at, d.picked_up_at, d.delivered_at, d.created_at, d.updated_at,
      d.rider_accepted_at, d.customer_arrived_at,
      d.delivered_receiver_name, d.delivered_confirmed_at, d.failed_at
    FROM public.store_order_deliveries AS d
    WHERE d.order_id = p_order_id
  ) AS x;

  SELECT to_jsonb(r.*)
  INTO v_review
  FROM public.store_reviews AS r
  WHERE r.order_id = p_order_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'order', v_order,
    'items', v_items,
    'store', coalesce(v_store, '{}'::jsonb),
    'delivery', v_delivery,
    'review', v_review
  );
EXCEPTION
  WHEN undefined_table THEN
    RETURN jsonb_build_object('ok', false, 'error', 'schema_incomplete');
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_buyer_store_order_detail_snapshot(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_buyer_store_order_detail_snapshot(uuid, uuid) TO service_role;

-- 롤백 참고(운영 직전 원문 요지, 2026-10-21 PHT pg_get_functiondef):
--   get_owner_store_order_detail_snapshot: v_order := to_jsonb(o.*) (store_id 일치), v_delivery := to_jsonb(d.*), 나머지 동일.
--   get_buyer_store_order_detail_snapshot: v_order := to_jsonb(o.*) (buyer 일치), v_items := jsonb_agg(to_jsonb(i.*) ORDER BY i.id),
--     v_delivery := to_jsonb(d.*), 나머지 동일.
