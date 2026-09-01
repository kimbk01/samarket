/**
 * 매장 오너 모바일 하단 탭 — 경로별 활성 탭 (단일 resolver).
 *
 * Menu domain: products hub + menu-categories (+ legacy `/menu` inbound).
 * DO NOT: keep `/menu` redirect as the tab href and only fake active.
 */

export type OwnerBottomNavTabId = "home" | "orders" | "order-chat" | "menu" | "settings";

/** @deprecated 단일 5탭 바 — variant 분기 없음 */
export type OwnerMobileBottomNavVariant = "default";

export function resolveOwnerMobileBottomNavVariant(_pathname: string): OwnerMobileBottomNavVariant {
  return "default";
}

function pathNorm(pathname: string): string {
  return pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
}

/** 하단 「메뉴」도메인 — 상품·카테고리·레거시 /menu */
export function isOwnerBottomNavMenuDomainPath(pathname: string): boolean {
  const p = pathNorm(pathname);
  if (p === "/stores/owner/menu" || p.startsWith("/stores/owner/menu/")) return true;
  if (p === "/stores/owner/menu-categories" || p.startsWith("/stores/owner/menu-categories/")) {
    return true;
  }
  if (p === "/stores/owner/products" || p.startsWith("/stores/owner/products/")) return true;
  return false;
}

export function resolveOwnerBottomNavActiveTabId(
  pathname: string,
  _searchParams: { get(name: string): string | null },
  _storeSlug?: string | null
): OwnerBottomNavTabId | null {
  const p = pathNorm(pathname);

  if (p === "/stores/owner") return "home";
  if (p.includes("/stores/owner/order-chats") || p.includes("/stores/owner/order-chat/")) {
    return "order-chat";
  }
  if (p.includes("/stores/owner/orders") || p.includes("/store-orders")) return "orders";
  if (isOwnerBottomNavMenuDomainPath(p)) return "menu";
  if (
    p.includes("/stores/owner/settings") ||
    p.includes("/stores/owner/profile") ||
    p.includes("/stores/owner/basic-info") ||
    p.includes("/stores/owner/banners") ||
    p.includes("/stores/owner/coupons") ||
    p.includes("/stores/owner/notices") ||
    p.includes("/stores/owner/reviews") ||
    p.includes("/stores/owner/ops-status") ||
    p.includes("/stores/owner/edit") ||
    p.includes("/stores/owner/settlements") ||
    p.includes("/stores/owner/finance") ||
    p.includes("/stores/owner/points") ||
    p.includes("/stores/owner/business-cash") ||
    p.includes("/stores/owner/inquiries")
  ) {
    return "settings";
  }

  return null;
}

export function isOwnerBottomNavTabActive(
  pathname: string,
  searchParams: { get(name: string): string | null },
  tabId: OwnerBottomNavTabId,
  storeSlug?: string | null
): boolean {
  return resolveOwnerBottomNavActiveTabId(pathname, searchParams, storeSlug) === tabId;
}
