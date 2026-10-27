import { isOwnerStoreCommerceNotificationRow } from "./owner-store-commerce-notification-meta";

/** 매장 오너 화면: 매장 id 가 일치하는 매장주문(오너) 알림만 — D-1 판정 값(event_store_id) 우선, 없으면 `meta.store_id` */
export function filterOwnerStoreCommerceByStoreId<
  T extends { meta?: unknown; event_kind?: string | null; event_store_id?: string | null },
>(rows: T[], storeId: string): T[] {
  const sid = storeId.trim();
  if (!sid) return rows;
  return rows.filter((r) => {
    if (!isOwnerStoreCommerceNotificationRow(r)) return false;
    const m = r.meta as { store_id?: string } | null | undefined;
    const rowStoreId = r.event_store_id || (typeof m?.store_id === "string" ? m.store_id : "");
    return rowStoreId === sid;
  });
}
