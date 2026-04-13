import { fetchAdminStoreOrdersQueryDeduped } from "@/lib/admin/fetch-admin-store-orders-query-deduped";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";

/**
 * 관리자 주문 상세 — `store_orders` 원장 1건 (항목 포함). 목록 API와 동일 dedupe 키 공유.
 */
export async function fetchAdminStoreOrderDetailDeduped(orderId: string): Promise<{
  status: number;
  order: AdminDeliveryOrder | null;
}> {
  const id = orderId.trim();
  if (!id) return { status: 400, order: null };
  const qs = `order_id=${encodeURIComponent(id)}&include_items=1&limit=1`;
  const { status, json: raw } = await fetchAdminStoreOrdersQueryDeduped(qs);
  const json = raw as {
    ok?: boolean;
    orders?: Array<{ admin_delivery?: AdminDeliveryOrder }>;
  };
  if (status < 200 || status >= 300 || !json?.ok || !Array.isArray(json.orders) || !json.orders[0]) {
    return { status, order: null };
  }
  const ad = json.orders[0].admin_delivery;
  return { status, order: ad ?? null };
}
