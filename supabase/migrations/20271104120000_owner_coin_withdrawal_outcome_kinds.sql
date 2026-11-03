-- 재감사 R1 (Owner 「설계안대로 수정」 2026-11-03) — docs/audit/currency-history-full-reaudit-2026-11-03.md §3 R1
-- Coin 출금 반려·지급 완료를 사장님에게 알린다(Cash 충전 결과와 같은 방식 · 매장 id 포함 → 매장 종·매장 알림함, 회원 종 제외).
-- 이 함수에 두 종류만 추가한다. 기존 행 변경 없음(이 종류의 기존 행 0건 — 새로 만드는 종류).
-- TS 짝: lib/notifications/owner-store-commerce-notification-meta.ts OWNER_STORE_OPS_NOTICE_META_KINDS
-- Rollback: 20271102110000_owner_platform_inquiry_reply_kind.sql 의 owner_store_ops_notice_notification_kinds() 재적용.

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
    'store_platform_inquiry_replied',
    'store_coin_withdrawal_rejected',
    'store_coin_withdrawal_paid'
  ]::text[];
$function$;

COMMIT;
