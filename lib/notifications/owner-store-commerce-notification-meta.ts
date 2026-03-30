/**
 * 매장 오너(사업자)에게만 가는 인앱 알림 — `meta.kind` 기준.
 * 구매자용 매장 주문 알림과 구분해 `/my` 알림·배지에서 제외한다.
 */
export const OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS = new Set([
  "store_order_created",
  "store_order_payment_completed",
  "store_order_buyer_cancelled",
  "store_order_refund_requested",
]);

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
