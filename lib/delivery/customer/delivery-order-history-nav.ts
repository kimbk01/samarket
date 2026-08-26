import { OwnerRoutes } from "@/lib/business/owner-routes";

/** 배달 헤더 document 아이콘 — Activity Hub. 매장주만 매장 주문 목록. */
export function resolveDeliveryOrderHistoryHref(ownerStoreId?: string | null): string {
  const sid = (ownerStoreId ?? "").trim();
  if (sid) return OwnerRoutes.orders(sid);
  return "/orders/activity";
}
