/**
 * 매장 오너 모바일 하단 탭 — 경로별 활성 탭.
 */

export type OwnerBottomNavTabId =
  | "dashboard"
  | "order-chat"
  | "orders"
  | "menu"
  | "settings";

/** @deprecated 단일 5탭 바 — variant 분기 없음 */
export type OwnerMobileBottomNavVariant = "default";

export function resolveOwnerMobileBottomNavVariant(_pathname: string): OwnerMobileBottomNavVariant {
  return "default";
}

function pathNorm(pathname: string): string {
  return pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
}

export function resolveOwnerBottomNavActiveTabId(
  pathname: string,
  _searchParams: { get(name: string): string | null }
): OwnerBottomNavTabId | null {
  const p = pathNorm(pathname);

  if (p === "/stores/owner") return "dashboard";
  if (p.includes("/stores/owner/order-chats")) return "order-chat";
  if (p.includes("/stores/owner/orders") || p.includes("/store-orders")) return "orders";
  if (p.includes("/stores/owner/menu")) return "menu";
  if (
    p.includes("/stores/owner/settings") ||
    p.includes("/stores/owner/profile") ||
    p.includes("/stores/owner/basic-info") ||
    p.includes("/stores/owner/banners") ||
    p.includes("/stores/owner/notices") ||
    p.includes("/stores/owner/reviews") ||
    p.includes("/stores/owner/ops-status") ||
    p.includes("/stores/owner/edit") ||
    p.includes("/stores/owner/settlements") ||
    p.includes("/stores/owner/products") ||
    p.includes("/stores/owner/inquiries")
  ) {
    return "settings";
  }

  return null;
}

export function isOwnerBottomNavTabActive(
  pathname: string,
  searchParams: { get(name: string): string | null },
  tabId: OwnerBottomNavTabId
): boolean {
  return resolveOwnerBottomNavActiveTabId(pathname, searchParams) === tabId;
}
