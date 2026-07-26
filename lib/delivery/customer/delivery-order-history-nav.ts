import { OwnerRoutes } from "@/lib/business/owner-routes";

/** 배달 허브·하단 탭 「주문내역」 — 구매자 `/orders`, 매장주 매장 주문 목록 */
export function resolveDeliveryOrderHistoryHref(ownerStoreId?: string | null): string {
  const sid = (ownerStoreId ?? "").trim();
  if (sid) return OwnerRoutes.orders(sid);
  return "/orders";
}
