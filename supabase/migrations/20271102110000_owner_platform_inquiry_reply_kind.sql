-- 알림 재감사 S4 D7 (Owner 승인 2026-11-02) — docs/audit/notification-full-reaudit-store-admin-2026-11-02.md §6 D7 (O6)
-- 사장님용 「플랫폼 문의 답변」(notify-store-points · kind store_platform_inquiry_replied + store_id)을 오너 운영 알림으로.
-- 매장 id 가 있는 행만 오너(get_owner_dashboard_notifications_snapshot 의 기존 조건) → 매장 종·매장 알림함, 회원 종 제외.
-- 이 종류의 기존 행은 0건(옛 1건은 종류 없이 저장돼 회원 쪽에 그대로 남는다 — 데이터 변경 없음).
-- TS 짝: lib/notifications/owner-store-commerce-notification-meta.ts OWNER_STORE_OPS_NOTICE_META_KINDS
-- Rollback: 20261028004405_owner_store_ops_notice_kinds.sql 의 owner_store_ops_notice_notification_kinds() 재적용.

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
    'delivery_ad_business_cash_charge_rejected',
    'store_platform_inquiry_replied'
  ]::text[];
$function$;

COMMIT;
