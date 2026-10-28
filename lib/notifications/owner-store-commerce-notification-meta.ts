/**
 * 매장 오너(사업자)에게만 가는 인앱 알림 — `meta.kind` 기준.
 * 구매자용 매장 주문 알림과 구분해 `/my` 알림·배지에서 제외한다.
 *
 * CONTRACT: keep in sync with:
 * - OWNER_STORE_OPERATION_META_KINDS (phase1)
 * - owner_store_commerce_notification_kinds() SQL
 *   (supabase/migrations/20270702120000_owner_inbox_read_notification_events.sql)
 * DO NOT invent kinds — only writers in notify-store-commerce / notify-store-points.
 */
export const OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS = new Set([
  "store_order_created",
  "store_order_accept_reminder_30s",
  "store_order_accept_reminder_60s",
  "store_order_accept_timeout_cancelled",
  "store_order_payment_completed",
  "store_order_buyer_cancelled",
  "store_order_sold_out",
  "store_order_refund_requested",
  // Historical store-operation notifications (Member exclude + Owner inbox exclude)
  "store_point_blocked",
  "store_point_deducted",
  "store_point_low",
  "store_point_charge_approved",
  "store_point_charge_rejected",
  "store_point_charge_on_hold",
  "store_point_account_replied",
]);

/**
 * B-04 (재감사 · Owner 승인 2026-10-28): 관리자 → 오너 운영 알림. **매장 id(meta.store_id)가 있는 행만** 오너 알림이다.
 * 매장 id 가 없는 과거 행은 회원 쪽에 남긴다(어디에서도 안 보이는 행 방지).
 * SQL 짝: public.owner_store_ops_notice_notification_kinds() (20261028004405_owner_store_ops_notice_kinds.sql)
 */
export const OWNER_STORE_OPS_NOTICE_META_KINDS = new Set([
  "admin_store_order_intervention",
  "admin_store_decision",
  "admin_store_operational_notice",
  "delivery_ad_changes_requested",
  "delivery_ad_approved",
  "delivery_ad_rejected",
  "delivery_ad_paused_admin",
  "delivery_ad_resumed",
  "delivery_ad_terminated",
  "delivery_ad_ended",
  "delivery_ad_admin_message",
  "delivery_ad_business_cash_charge_completed",
  "delivery_ad_business_cash_charge_rejected",
]);

export function isOwnerStoreOpsNoticeKindWithStore(
  kind: string | null | undefined,
  storeId: string | null | undefined
): boolean {
  return (
    OWNER_STORE_OPS_NOTICE_META_KINDS.has(String(kind ?? "").trim()) &&
    String(storeId ?? "").trim().length > 0
  );
}

/** Ordered list for SQL IN (...) parity / migration contracts */
export const OWNER_STORE_COMMERCE_NOTIFICATION_META_KIND_LIST = [
  ...OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
] as const;

export function isOwnerStoreCommerceNotificationRow(row: {
  meta?: unknown;
  /** D-1 판정 kind (목록 DTO) — 있으면 우선. */
  event_kind?: string | null;
  event_store_id?: string | null;
}): boolean {
  const meta = row.meta as { kind?: string; store_id?: string } | null | undefined;
  const k = row.event_kind || meta?.kind;
  if (typeof k !== "string") return false;
  if (OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(k)) return true;
  // B-04: 운영 알림은 매장 id 가 있을 때만 오너
  return isOwnerStoreOpsNoticeKindWithStore(k, row.event_store_id || meta?.store_id);
}

/** 매장 주문 구매자(주문자) 인앱 알림 — 배송 중·완료 등. 하단 네비 배지에서는 제외하고 상단 종에는 포함 */
export const BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS = new Set([
  "store_order_payment_completed_buyer",
  "store_order_owner_status",
  "store_order_payment_failed",
  "store_order_refund_approved",
  "store_order_auto_completed",
]);

export function isBuyerStoreCommerceNotificationRow(row: {
  meta?: unknown;
  notification_type?: string;
}): boolean {
  if (row.notification_type !== "commerce") return false;
  const k = (row.meta as { kind?: string } | null | undefined)?.kind;
  return typeof k === "string" && BUYER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(k);
}
