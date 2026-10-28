-- 알림 재감사 B-04 (Owner 승인 2026-10-28): 오너 운영 알림(관리자 주문 개입·매장 심사 결정·매장 운영 공지·
-- 광고 심사/상태/관리자 메시지·광고 캐시 충전 결과)이 회원 알림 A(종·앱 아이콘)로 집계되고 오너 알림함에 안 보이던 문제.
--
-- 규칙: 이 종류는 매장 id(meta.store_id)가 있는 행만 오너로 본다.
--   매장 id 가 없는 과거 행은 회원 쪽에 그대로 남는다(데이터 변경 없음 — 어디에서도 안 보이는 행 방지).
-- TS 짝: lib/notifications/owner-store-commerce-notification-meta.ts OWNER_STORE_OPS_NOTICE_META_KINDS

BEGIN;

CREATE OR REPLACE FUNCTION public.owner_store_ops_notice_notification_kinds()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT ARRAY[
    'admin_store_order_intervention',
    'admin_store_decision',
    'admin_store_operational_notice',
    'delivery_ad_changes_requested',
    'delivery_ad_approved',
    'delivery_ad_rejected',
    'delivery_ad_paused_admin',
    'delivery_ad_resumed',
    'delivery_ad_terminated',
    'delivery_ad_ended',
    'delivery_ad_admin_message',
    'delivery_ad_business_cash_charge_completed',
    'delivery_ad_business_cash_charge_rejected'
  ]::text[];
$function$;

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

-- 오너 미읽음 숫자(사용자 전체 범위)에서도 매장 id 없는 운영 알림은 제외 — 회원 숫자와 이중 집계 방지.
-- 목록 함수 get_owner_store_commerce_notifications 는 이미 store_id = p_store_id 로 거르므로 변경 없음.
DO $do$
DECLARE
  d text;
  marker constant text := $m$AND coalesce(ne.display_payload->>'deleted_at', '') = ''$m$;
  guard constant text := $g$AND (coalesce(ne.display_payload->'legacyMeta'->>'kind', ne.display_payload->>'kind') <> ALL (public.owner_store_ops_notice_notification_kinds()) OR trim(coalesce(ne.display_payload->'legacyMeta'->>'store_id', ne.display_payload->>'store_id', '')) <> '') $g$;
BEGIN
  d := pg_get_functiondef('public.get_owner_dashboard_notifications_snapshot(uuid,uuid,integer,text)'::regprocedure);
  IF position('owner_store_ops_notice_notification_kinds' in d) > 0 THEN
    RETURN;
  END IF;
  IF (length(d) - length(replace(d, marker, ''))) / length(marker) <> 1 THEN
    RAISE EXCEPTION 'b04_snapshot_marker_not_unique';
  END IF;
  EXECUTE replace(d, marker, guard || marker);
END
$do$;

COMMIT;
