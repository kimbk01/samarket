/**
 * 매장 오너 모바일 하단 탭 — 경로별 활성 탭 (단일 resolver).
 * Primary: 홈 · 주문 · 상품 · 고객 · 관리
 */

import type { OwnerBottomNavTabId } from "@/lib/business/owner-nav-registry";

export type { OwnerBottomNavTabId };

/** @deprecated 단일 5탭 바 — variant 분기 없음 */
export type OwnerMobileBottomNavVariant = "default";

export function resolveOwnerMobileBottomNavVariant(_pathname: string): OwnerMobileBottomNavVariant {
  return "default";
}

function pathNorm(pathname: string): string {
  return pathname.split("?")[0]?.replace(/\/+$/, "") ?? "";
}

/** 하단 「상품」도메인 — 상품·카테고리·쿠폰·상품권·배너·공지·레거시 /menu */
export function isOwnerBottomNavProductsDomainPath(pathname: string): boolean {
  const p = pathNorm(pathname);
  if (p === "/stores/owner/menu" || p.startsWith("/stores/owner/menu/")) return true;
  if (p === "/stores/owner/menu-categories" || p.startsWith("/stores/owner/menu-categories/")) {
    return true;
  }
  if (p === "/stores/owner/products" || p.startsWith("/stores/owner/products/")) return true;
  if (p === "/stores/owner/coupons" || p.startsWith("/stores/owner/coupons/")) return true;
  if (p === "/stores/owner/gift-certificates" || p.startsWith("/stores/owner/gift-certificates/")) {
    return true;
  }
  if (p === "/stores/owner/banners" || p.startsWith("/stores/owner/banners/")) return true;
  if (p === "/stores/owner/notices" || p.startsWith("/stores/owner/notices/")) return true;
  return false;
}

/** @deprecated use isOwnerBottomNavProductsDomainPath */
export function isOwnerBottomNavMenuDomainPath(pathname: string): boolean {
  return isOwnerBottomNavProductsDomainPath(pathname);
}

export function isOwnerBottomNavCustomersDomainPath(pathname: string): boolean {
  const p = pathNorm(pathname);
  if (p.includes("/stores/owner/customer-care")) return true;
  if (p.includes("/stores/owner/order-chats") || p.includes("/stores/owner/order-chat/")) return true;
  if (p.includes("/stores/owner/inquiries")) return true;
  if (p.includes("/stores/owner/reviews")) return true;
  return false;
}

export function isOwnerBottomNavManageDomainPath(pathname: string): boolean {
  const p = pathNorm(pathname);
  if (isOwnerBottomNavProductsDomainPath(p)) return false;
  if (isOwnerBottomNavCustomersDomainPath(p)) return false;
  if (p.includes("/stores/owner/orders")) return false;
  if (p === "/stores/owner") return false;
  if (
    p.includes("/stores/owner/settings") ||
    p.includes("/stores/owner/profile") ||
    p.includes("/stores/owner/basic-info") ||
    p.includes("/stores/owner/ops-status") ||
    p.includes("/stores/owner/edit") ||
    p.includes("/stores/owner/settlements") ||
    p.includes("/stores/owner/finance") ||
    p.includes("/stores/owner/points") ||
    p.includes("/stores/owner/business-cash") ||
    p.includes("/stores/owner/ads")
  ) {
    return true;
  }
  return false;
}

export function resolveOwnerBottomNavActiveTabId(
  pathname: string,
  _searchParams: { get(name: string): string | null },
  _storeSlug?: string | null
): OwnerBottomNavTabId | null {
  const p = pathNorm(pathname);

  if (p === "/stores/owner") return "home";
  if (p.includes("/stores/owner/orders") || p.includes("/store-orders")) return "orders";
  if (isOwnerBottomNavProductsDomainPath(p)) return "products";
  if (isOwnerBottomNavCustomersDomainPath(p)) return "customers";
  if (isOwnerBottomNavManageDomainPath(p)) return "manage";

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
