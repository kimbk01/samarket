/**
 * 스토어 슬러그 하위(메뉴·상품·장바구니·결제·주문 등)에서는 배달 전용 하단 탭을 숨긴다.
 * 허브(`/stores`, 검색, 브라우즈, 전역 장바구니)에서는 탭 유지.
 */
const STORES_HUB_FIRST_SEGMENTS = new Set(["search", "browse", "cart"]);

export function shouldHideStoresDeliveryBottomNav(pathname: string): boolean {
  const path = (pathname.split("?")[0] ?? "").trim();
  if (!path.startsWith("/stores")) return false;
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  const first = segments[1];
  if (!first) return false;
  if (STORES_HUB_FIRST_SEGMENTS.has(first)) return false;
  return true;
}
