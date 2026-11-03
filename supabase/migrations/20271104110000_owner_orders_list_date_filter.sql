-- 사장님 주문 목록 날짜 필터 (Owner 「설계안대로 구현」 2026-11-03)
-- 설계: docs/audit/owner-orders-date-filter-design-2026-11-03.md §3-1
--
-- get_owner_store_orders_list_snapshot 에 p_from·p_to·p_date_basis(created|completed) 추가 (모두 기본값).
-- - 기존 5개 매개변수 호출(이름 지정)은 기본값으로 그대로 동작 — 날짜 조건 없음 = 이전과 같은 결과
-- - 날짜 조건이 있으면 기준 열이 [p_from, p_to) 인 주문만 · 진행 중 주문 덧붙이기(open_rows) 없음
-- - 같은 이름 함수 2개(5개·8개 매개변수)가 남으면 이름 지정 호출이 모호해지므로 이전 것을 지우고 같은 트랜잭션에서 다시 만든다
-- - 행 칸에 completed_at·refunded_at 추가 (완료 탭 완료 날짜 묶음)
-- - 「이전 주문 더 보기」 커서 결함 수정: 페이지 경계마다 1건 누락(다음 페이지 첫 행을 커서로 주고 「미만」으로 이어 받음)
-- 롤백: docs/audit/rollback/20271104110000_owner_orders_list_date_filter.rollback.sql
--   (이전 5개 매개변수 본문 — 2026-11-03 운영 조회본과 md5 일치)

DROP FUNCTION IF EXISTS public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text);

CREATE OR REPLACE FUNCTION public.get_owner_store_orders_list_snapshot(
  p_store_id uuid,
  p_owner_user_id uuid,
  p_status text DEFAULT ''::text,
  p_limit integer DEFAULT 60,
  p_cursor text DEFAULT ''::text,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_date_basis text DEFAULT 'created'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_ok boolean := false;
  v_limit integer := greatest(1, least(120, coalesce(p_limit, 60)));
  v_status text := coalesce(trim(p_status), '');
  v_cursor text := coalesce(trim(p_cursor), '');
  v_cursor_created timestamptz;
  v_cursor_id uuid;
  v_dash jsonb;
  v_reviews_exist boolean := false;
  v_has_range boolean := p_from IS NOT NULL AND p_to IS NOT NULL AND p_to > p_from;
  v_completed_basis boolean := coalesce(p_date_basis, 'created') = 'completed';
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
          NOT v_has_range
          OR (
            NOT v_completed_basis
            AND o.created_at >= p_from AND o.created_at < p_to
          )
          OR (
            v_completed_basis
            AND o.completed_at >= p_from AND o.completed_at < p_to
          )
        )
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
        AND NOT v_has_range
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
    -- 다음 페이지 커서 = 이번 페이지 마지막 행(커서 조건이 「미만」이라 그 다음 행부터 이어짐).
    -- 이전: 다음 페이지 첫 행을 커서로 줘서 페이지마다 1건씩 빠졌음(운영 정의에서 재현 · 2026-11-03).
    next_row AS (
      SELECT w.created_at, w.id
      FROM win_rows w
      WHERE (SELECT count(*) FROM order_rows) > v_limit
      ORDER BY w.created_at ASC, w.id ASC
      LIMIT 1
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
          o.completed_at,
          o.refunded_at,
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
$function$;

REVOKE ALL ON FUNCTION public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text, timestamptz, timestamptz, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_store_orders_list_snapshot(uuid, uuid, text, integer, text, timestamptz, timestamptz, text) TO service_role;
