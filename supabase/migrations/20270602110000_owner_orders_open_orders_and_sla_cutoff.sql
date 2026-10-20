-- 배달 오너 감사 1-A (Owner 승인 2026-10-21) — docs/audit/delivery-owner-2026-10-20/F-remediation-plan-approval.md
-- ORD-05: 오너 주문 목록 첫 페이지가 최근 60건만 반환 → 61번째 이후 처리 대기·진행 중 주문(취소 요청 등)이 목록·탭에 보이지 않음.
--         첫 페이지(상태 필터·커서 없음)에 미종료 주문 전부(상한 300)를 함께 싣는다. 페이지 커서(next_cursor)는 기존처럼
--         최근 창(p_limit) 기준이라 이전 이력 페이지와 겹치지 않는다(겹치는 미종료 행은 클라이언트가 id 로 병합).
-- ORD-03/DLV-03: SLA 경고 스캔은 2026-10-20 20:30 UTC 이후 생성 주문만 대상 — 이전 주문은 개발·테스트 자료(Owner D-5)라
--         경고 플래그·관리자 주의 표시를 새로 달지 않는다 (수수료 재활성 기준 시각 20270602100100 과 동일).
-- 함수 본문에는 비 ASCII 주석을 넣지 않는다.
-- 롤백: 20260526000000_owner_store_orders_list_snapshot.sql 의 목록 함수, 운영 직전 정의의 SLA 함수(candidates 의 created_at 조건 제거).

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
          o.admin_flagged,
          o.dispute_status,
          o.admin_note,
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

CREATE OR REPLACE FUNCTION public.scan_store_order_sla_warnings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
declare
  v_now timestamptz := now();
  c_scan_from constant timestamptz := '2026-10-20 20:30:00+00';
begin
  with candidates as (
    select
      so.id,
      so.store_id,
      so.buyer_user_id,
      so.order_status,
      so.payment_status,
      so.created_at,
      so.updated_at,
      so.estimated_ready_at,
      so.sla_warning_level as prev_level,
      so.sla_warning_reason as prev_reason,
      so.needs_admin_attention as prev_attention,
      sod.delivery_status as delivery_status,
      sod.updated_at as delivery_updated_at
    from public.store_orders so
    left join public.store_order_deliveries sod
      on sod.order_id = so.id
    where so.order_status not in ('completed','cancelled','refunded')
      and so.created_at >= c_scan_from
      and (
        so.created_at > v_now - interval '7 days'
        or so.updated_at > v_now - interval '7 days'
        or so.estimated_ready_at is not null
      )
  ),
  computed as (
    select
      c.id,
      case
        when c.order_status = 'refund_requested' and c.updated_at < v_now - interval '60 minutes' then 'critical'
        when c.order_status = 'delivering' and c.updated_at < v_now - interval '60 minutes' then 'critical'
        when c.estimated_ready_at is not null and c.estimated_ready_at < v_now
             and c.order_status in ('accepted','preparing','ready_for_pickup','delivering','arrived') then 'warning'
        when c.order_status = 'pending' and c.created_at < v_now - interval '5 minutes' then 'warning'
        when c.delivery_status = 'waiting_rider'
             and coalesce(c.delivery_updated_at, c.updated_at, c.created_at) < v_now - interval '10 minutes' then 'warning'
        else null
      end as level,
      case
        when c.order_status = 'refund_requested' and c.updated_at < v_now - interval '60 minutes' then 'refund_overdue'
        when c.order_status = 'delivering' and c.updated_at < v_now - interval '60 minutes' then 'delivery_over_60m'
        when c.estimated_ready_at is not null and c.estimated_ready_at < v_now
             and c.order_status in ('accepted','preparing','ready_for_pickup','delivering','arrived') then 'eta_overdue'
        when c.order_status = 'pending' and c.created_at < v_now - interval '5 minutes' then 'pending_over_5m'
        when c.delivery_status = 'waiting_rider'
             and coalesce(c.delivery_updated_at, c.updated_at, c.created_at) < v_now - interval '10 minutes' then 'unassigned_over_10m'
        else null
      end as reason,
      case
        when c.order_status = 'refund_requested' and c.updated_at < v_now - interval '60 minutes' then true
        when c.order_status = 'delivering' and c.updated_at < v_now - interval '60 minutes' then true
        when c.estimated_ready_at is not null and c.estimated_ready_at < v_now
             and c.order_status in ('accepted','preparing','ready_for_pickup','delivering','arrived') then true
        when c.order_status = 'pending' and c.created_at < v_now - interval '5 minutes' then true
        when c.delivery_status = 'waiting_rider'
             and coalesce(c.delivery_updated_at, c.updated_at, c.created_at) < v_now - interval '10 minutes' then true
        else false
      end as needs_attention
    from candidates c
  ),
  to_update as (
    select
      c.id,
      comp.level as next_level,
      comp.reason as next_reason,
      comp.needs_attention as next_attention,
      c.prev_reason
    from candidates c
    join computed comp on comp.id = c.id
    where
      (c.prev_level is distinct from comp.level)
      or (c.prev_reason is distinct from comp.reason)
      or (c.prev_attention is distinct from comp.needs_attention)
  )
  update public.store_orders so
  set
    sla_warning_level = t.next_level,
    sla_warning_reason = t.next_reason,
    needs_admin_attention = t.next_attention,
    sla_warning_at = case
      when t.next_reason is null then null
      when t.prev_reason is distinct from t.next_reason then v_now
      when so.sla_warning_at is null then v_now
      else so.sla_warning_at
    end
  from to_update t
  where so.id = t.id;
end;
$fn$;

REVOKE ALL ON FUNCTION public.scan_store_order_sla_warnings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_store_order_sla_warnings() TO service_role;
