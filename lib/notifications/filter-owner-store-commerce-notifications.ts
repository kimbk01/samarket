import { isOwnerStoreCommerceNotificationRow } from "./owner-store-commerce-notification-meta";

/** 매장 오너 화면: `meta.store_id` 가 일치하는 매장주문(오너) 알림만 */
export function filterOwnerStoreCommerceByStoreId<T extends { meta?: unknown }>(
  rows: T[],
  storeId: string
): T[] {
  const sid = storeId.trim();
  if (!sid) return rows;
  return rows.filter((r) => {
    if (!isOwnerStoreCommerceNotificationRow(r)) return false;
    const m = r.meta as { store_id?: string } | null | undefined;
    return typeof m?.store_id === "string" && m.store_id === sid;
  });
}
