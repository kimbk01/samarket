/**
 * 매장 오너 모바일 하단 탭 — 경로별 활성 탭 (단일 resolver).
 * Primary: 홈 · 주문 · 상품 · 고객 · 관리
 *
 * 4단계 IA-10 규칙 (4): 활성 탭 = `owner-nav-registry` 일치 항목의 `bottomTab` 에서만 파생
 * (알림·광고 하위·쿠폰·배너·공지·상품권·정산·플랫폼 고객센터 = 「관리」, 주문 채팅 = 「주문」).
 */

import {
  resolveOwnerNavBottomTab,
  type OwnerBottomNavTabId,
} from "@/lib/business/owner-nav-registry";

export type { OwnerBottomNavTabId };

/** @deprecated 단일 5탭 바 — variant 분기 없음 */
export type OwnerMobileBottomNavVariant = "default";

export function resolveOwnerMobileBottomNavVariant(_pathname: string): OwnerMobileBottomNavVariant {
  return "default";
}

/** 하단 「상품」 도메인 — 레지스트리 `bottomTab === "products"` */
export function isOwnerBottomNavProductsDomainPath(pathname: string): boolean {
  return resolveOwnerNavBottomTab(pathname) === "products";
}

/** @deprecated use isOwnerBottomNavProductsDomainPath */
export function isOwnerBottomNavMenuDomainPath(pathname: string): boolean {
  return isOwnerBottomNavProductsDomainPath(pathname);
}

export function isOwnerBottomNavCustomersDomainPath(pathname: string): boolean {
  return resolveOwnerNavBottomTab(pathname) === "customers";
}

export function isOwnerBottomNavManageDomainPath(pathname: string): boolean {
  return resolveOwnerNavBottomTab(pathname) === "manage";
}

export function resolveOwnerBottomNavActiveTabId(
  pathname: string,
  searchParams: { get(name: string): string | null },
  _storeSlug?: string | null
): OwnerBottomNavTabId | null {
  return resolveOwnerNavBottomTab(pathname, searchParams);
}

export function isOwnerBottomNavTabActive(
  pathname: string,
  searchParams: { get(name: string): string | null },
  tabId: OwnerBottomNavTabId,
  storeSlug?: string | null
): boolean {
  return resolveOwnerBottomNavActiveTabId(pathname, searchParams, storeSlug) === tabId;
}
