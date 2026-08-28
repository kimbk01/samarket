/**
 * 매장 오너(사업자)에게만 가는 인앱 알림 — `meta.kind` 기준.
 * 구매자용 매장 주문 알림과 구분해 `/my` 알림·배지에서 제외한다.
 *
 * CONTRACT: keep in sync with:
 * - OWNER_STORE_OPERATION_META_KINDS (phase1)
 * - count_notification_unread_segmented / get_owner_store_commerce_notifications SQL
 * DO NOT invent kinds — only writers in notify-store-commerce / notify-store-points.
 */
export const OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS = new Set([
  "store_order_created",
  "store_order_accept_reminder_30s",
  "store_order_accept_reminder_60s",
  "store_order_payment_completed",
  "store_order_buyer_cancelled",
  "store_order_sold_out",
  "store_order_refund_requested",
  // Owner Business Credit — was orphan (Member exclude + Owner inbox exclude)
  "store_point_blocked",
  "store_point_deducted",
  "store_point_low",
  "store_point_charge_approved",
  "store_point_charge_rejected",
  "store_point_charge_on_hold",
  "store_point_account_replied",
]);

/** Ordered list for SQL IN (...) parity / migration contracts */
export const OWNER_STORE_COMMERCE_NOTIFICATION_META_KIND_LIST = [
  ...OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS,
] as const;

export function isOwnerStoreCommerceNotificationRow(row: { meta?: unknown }): boolean {
  const k = (row.meta as { kind?: string } | null | undefined)?.kind;
  return typeof k === "string" && OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(k);
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
