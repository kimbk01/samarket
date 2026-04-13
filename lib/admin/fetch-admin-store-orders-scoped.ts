import { fetchAdminStoreOrdersQueryDeduped } from "@/lib/admin/fetch-admin-store-orders-query-deduped";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";

const BASE = "include_items=1&limit=500" as const;

export function parseAdminStoreOrdersResponse(raw: unknown): AdminDeliveryOrder[] {
  const j = raw as { ok?: boolean; orders?: Array<{ admin_delivery?: AdminDeliveryOrder }> };
  if (!j?.ok || !Array.isArray(j.orders)) return [];
  return j.orders
    .map((x) => x?.admin_delivery)
    .filter((x): x is AdminDeliveryOrder => x != null && typeof x.id === "string");
}

export function fetchAdminStoreOrdersForStore(storeId: string) {
  const id = storeId.trim();
  const qs = `store_id=${encodeURIComponent(id)}&${BASE}`;
  return fetchAdminStoreOrdersQueryDeduped(qs);
}

export function fetchAdminStoreOrdersForBuyer(buyerUserId: string) {
  const id = buyerUserId.trim();
  const qs = `buyer_user_id=${encodeURIComponent(id)}&${BASE}`;
  return fetchAdminStoreOrdersQueryDeduped(qs);
}

export function fetchAdminStoreOrdersByOrderStatus(orderStatus: string) {
  const s = orderStatus.trim();
  const qs = `order_status=${encodeURIComponent(s)}&${BASE}`;
  return fetchAdminStoreOrdersQueryDeduped(qs);
}
