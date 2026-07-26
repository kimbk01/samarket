/**
 * `StoreCommerceCartProvider` 마운트 표면 — 장바구니·재주문·카트 충돌 UI 가 필요한 경로만.
 *
 * `/orders` 는 하단 「주문내역」·`OrdersHubContent`·`StoreOrderReorderAgainButton` 이
 * `useStoreCommerceCart` 를 쓰므로 반드시 포함한다. (`/mypage` 만으로는 부족)
 *
 * DO NOT: `/stores/owner` 에서 Customer cart Provider 마운트 (Owner 도메인 누수).
 */
export function shouldMountStoreCommerceCartProvider(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  if (!p) return false;
  if (p === "/stores/owner" || p.startsWith("/stores/owner/")) return false;
  if (p.startsWith("/stores")) return true;
  if (p.startsWith("/mypage")) return true;
  if (p.startsWith("/orders")) return true;
  if (p.startsWith("/my/store-orders")) return true;
  return false;
}
