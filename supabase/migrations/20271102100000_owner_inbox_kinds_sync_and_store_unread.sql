-- 알림 재감사 S1 (Owner 승인 2026-11-02) — docs/audit/notification-full-reaudit-store-admin-2026-11-02.md O1·O2
--
-- O2: 파일 순서상 20270702120000 이 20261028004405 의 owner_store_commerce_notification_kinds() 를
--     운영 알림 없이 다시 정의한다. 운영 DB 는 운영 알림 포함 정의가 살아 있다(2026-11-02 pg_get_functiondef 확인).
--     새 DB·재적용 때도 같은 결과가 되도록 운영과 같은 정의를 마지막 순서로 다시 둔다(운영 DB 에는 변화 없음).
--     get_owner_dashboard_notifications_snapshot 도 운영 정의(운영 알림은 매장 id 있는 행만 — 20261028004405 DO 블록)를
--     그대로 옮기고 아래 O1 숫자만 더한다.
-- O1: 매장 종 숫자 — snapshot 의 unread_counts 에 그 매장(p_store_id) 미읽음 owner_store 를 더한다.
--     기존 키·형태는 그대로(owner_store_commerce = 회원 전체 매장). 앱은 owner_store 가 없으면 목록에서 센다.
-- Rollback: 20270702140000_owner_inbox_top_level_payload_kind.sql 의 get_owner_dashboard_notifications_snapshot 재적용
--           (kinds 함수는 운영과 같으므로 되돌릴 것 없음).

BEGIN;

CREATE OR REPLACE FUNCTION public.owner_store_commerce_notification_kinds()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT ARRAY[
    'store_order_created',
    'store_order_accept_reminder_30s',
    'store_order_accept_reminder_60s',
    'store_order_accept_timeout_cancelled',
    'store_order_payment_completed',
    'store_order_buyer_cancelled',
    'store_order_sold_out',
    'store_order_refund_requested',
    'store_point_blocked',
    'store_point_deducted',
    'store_point_low',
    'store_point_charge_approved',
    'store_point_charge_rejected',
    'store_point_charge_on_hold',
    'store_point_account_replied'
  ]::text[] || public.owner_store_ops_notice_notification_kinds();
$function$;

CREATE OR REPLACE FUNCTION public.get_owner_dashboard_notifications_snapshot(
  p_user_id uuid,
  p_store_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_cursor text DEFAULT ''
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cap AS (
    SELECT greatest(1, least(coalesce(p_limit, 200), 220))::integer AS n
  ),
  owner_rows AS (
    SELECT ne.*
    FROM public.notification_events ne
    WHERE ne.user_id = p_user_id
      AND coalesce(ne.display_payload->'legacyMeta'->>'kind', ne.display_payload->>'kind') = ANY (public.owner_store_commerce_notification_kinds())
      -- 운영 DB 정의와 같게(20261028004405 DO 블록이 넣은 조건): 운영 알림은 매장 id 가 있는 행만 오너
      AND (
        coalesce(ne.display_payload->'legacyMeta'->>'kind', ne.display_payload->>'kind') <> ALL (public.owner_store_ops_notice_notification_kinds())
        OR trim(coalesce(ne.display_payload->'legacyMeta'->>'store_id', ne.display_payload->>'store_id', '')) <> ''
      )
      AND coalesce(ne.display_payload->>'deleted_at', '') = ''
      AND coalesce(ne.display_payload->>'inbox_dismissed_at', '') = ''
      AND coalesce(ne.display_payload->>'deleted', 'false') <> 'true'
  ),
  unread_owner AS (
    SELECT count(*)::integer AS owner_store_commerce
    FROM owner_rows o
    WHERE o.unread = true AND o.read_at IS NULL
  ),
  unread_store AS (
    SELECT count(*)::integer AS owner_store
    FROM owner_rows o
    WHERE p_store_id IS NOT NULL
      AND o.unread = true AND o.read_at IS NULL
      AND trim(coalesce(o.display_payload->'legacyMeta'->>'store_id', o.display_payload->>'store_id', '')) = p_store_id::text
  ),
  store_filtered AS (
    SELECT o.*
    FROM owner_rows o
    WHERE p_store_id IS NOT NULL
      AND trim(coalesce(o.display_payload->'legacyMeta'->>'store_id', o.display_payload->>'store_id', '')) = p_store_id::text
    ORDER BY o.created_at DESC
    LIMIT (SELECT n FROM cap)
  ),
  notifications_arr AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', sf.id,
          'notification_type', coalesce(nullif(sf.display_payload->>'legacyNotificationType', ''), 'commerce'),
          'title', sf.title,
          'body', sf.body,
          'link_url', coalesce(sf.display_payload->>'routeUrl', sf.display_payload->>'targetRoute'),
          'is_read', (sf.unread = false OR sf.read_at IS NOT NULL),
          'created_at', sf.created_at,
          'meta', coalesce(sf.display_payload->'legacyMeta', sf.display_payload - 'deleted_at' - 'inbox_dismissed_at', '{}'::jsonb)
        )
        ORDER BY sf.created_at DESC
      ),
      '[]'::jsonb
    ) AS notifications
    FROM store_filtered sf
  )
  SELECT jsonb_build_object(
    'unread_counts',
      CASE
        WHEN p_store_id IS NULL THEN jsonb_build_object(
          'owner_store_commerce', coalesce((SELECT owner_store_commerce FROM unread_owner), 0)
        )
        ELSE jsonb_build_object(
          'owner_store_commerce', coalesce((SELECT owner_store_commerce FROM unread_owner), 0),
          'owner_store', coalesce((SELECT owner_store FROM unread_store), 0)
        )
      END,
    'notifications', (SELECT notifications FROM notifications_arr),
    'latest_orders', '[]'::jsonb,
    'latest_inquiries', '[]'::jsonb,
    'latest_messages', '[]'::jsonb,
    'preview_summaries', '[]'::jsonb,
    'store_id', CASE WHEN p_store_id IS NULL THEN NULL ELSE p_store_id::text END,
    'cursor', coalesce(nullif(trim(p_cursor), ''), ''),
    'updated_at', now()
  );
$$;

COMMIT;
