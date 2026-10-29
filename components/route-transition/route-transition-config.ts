/**
 * 메인 셸 포털형 슬라이드 — canonical 탭 사다리(제품 확정).
 * 하단 탭 배열 순서와 무관하게 pathname 만으로 방향을 맞춘다.
 */

import { isCommunityMessengerRoomPathname } from "@/lib/layout/conditional-app-shell-flags";
import { isCommunityHomeSurfacePath } from "@/lib/layout/resolve-main-surface";

export { shouldSuppressOwnerStackMainShellSlide } from "@/lib/business/owner-stack-path";
export { shouldSuppressCommerceConsumerMainShellSlide } from "@/lib/delivery/customer/commerce-child-page-slide";

/** philife(0) → market(1) → delivery(2) → messenger(3) → mypage(4) */
export const CANONICAL_NAV_INDICES = {
  philife: 0,
  market: 1,
  delivery: 2,
  messenger: 3,
  mypage: 4,
} as const;

export type RouteTransitionEnterKind =
  | "none"
  | "subtle"
  | "ltr-forward"
  | "rtl-forward"
  | "ltr-back"
  | "rtl-back"
  /** 내정보 → `/stores/owner/apply` — 370ms 우→좌 */
  | "store-apply-forward"
  /** `/stores/owner/apply` → 내정보 — 370ms 좌→우 */
  | "store-apply-back"
  /** 내정보 → `/stores/owner` 매장 진입 — 440ms 하→상 */
  | "store-enter-forward"
  /** `/stores/owner` → 내정보 — 440ms 상→하(exit) */
  | "store-enter-back"
  /** 내정보 → 프로필 수정 — 440ms 우→좌 80% */
  | "profile-edit-forward"
  /** 프로필 수정 → 내정보 — 360ms 좌→우 80% */
  | "profile-edit-back"
  /** 임의 화면 → 주소록/검색/상세 — 440ms 우→좌 80% */
  | "address-platform-forward"
  /** 주소록/검색/상세 복귀 — 360ms 좌→우 80% (내정보 kind — 시간은 `MYPAGE_MOTION_MS`) */
  | "address-platform-back"
  /** 내정보 ↔ 내정보 push — 300ms 우→좌 (X2) */
  | "mypage-stack-forward"
  /** 내정보 ↔ 내정보 back — 300ms 좌→우 (X2) */
  | "mypage-stack-back";

export function normalizePathForRouteTransition(pathname: string | null): string {
  return (pathname ?? "").split("?")[0]?.trim() ?? "";
}

/** `/admin`, `/auth`, 계열 등 — 메인 슬라이드 비적용 */
export function isExcludedFromMainShellTransition(pathname: string | null): boolean {
  const p = normalizePathForRouteTransition(pathname);
  if (!p) return true;
  if (p.startsWith("/admin")) return true;
  if (p.startsWith("/auth")) return true;
  if (p.startsWith("/account")) return true;
  return false;
}

/** 메신저 채팅방 상세 — 메인 셸 슬라이드 생략(방 전용 전환 유지) */
export function shouldSuppressMessengerRoomMainShellSlide(prev: string | null, next: string | null): boolean {
  return isCommunityMessengerRoomPathname(prev) || isCommunityMessengerRoomPathname(next);
}

/**
 * Messenger PAGE_HIERARCHY internal surfaces — AppRouteTransition must not compete.
 * Token/consumer SSOT: `lib/community-messenger/messenger-list-room-slide.ts` + surface shells.
 *
 * CONTRACT:
 * - Bottom-nav MAIN↔MAIN (e.g. /market → /community-messenger) keeps AppRouteTransition.
 * - Hub ↔ trade-chats ↔ delivery-chats ↔ rooms ↔ web call routes: kind = none.
 * - Room paths remain suppressed even when the other side is outside messenger (deep entry).
 */
export function isMessengerInternalPageHierarchyPathname(pathname: string | null | undefined): boolean {
  const p = normalizePathForRouteTransition(pathname ?? null);
  if (!p) return false;
  if (p === "/community-messenger") return true;
  if (p.startsWith("/community-messenger/trade-chats")) return true;
  if (p.startsWith("/community-messenger/delivery-chats")) return true;
  if (isCommunityMessengerRoomPathname(p)) return true;
  if (p === "/community-messenger/calls/logs" || p === "/community-messenger/calls/outgoing") return true;
  if (/^\/community-messenger\/calls\/[^/]+$/.test(p)) return true;
  if (/^\/community-messenger\/calls-v[34]\/[^/]+$/.test(p)) return true;
  return false;
}

/** Hub↔pillar (and other messenger-internal pairs) — both sides messenger hierarchy. */
export function shouldSuppressMessengerInternalHierarchyMainShellSlide(
  prev: string | null,
  next: string | null
): boolean {
  return (
    isMessengerInternalPageHierarchyPathname(prev) && isMessengerInternalPageHierarchyPathname(next)
  );
}

/** Room OR messenger-internal hierarchy — single gate for AppRouteTransition competition. */
export function shouldSuppressMessengerPageMotionMainShellSlide(
  prev: string | null,
  next: string | null
): boolean {
  return (
    shouldSuppressMessengerRoomMainShellSlide(prev, next) ||
    shouldSuppressMessengerInternalHierarchyMainShellSlide(prev, next)
  );
}

/**
 * Canonical 인덱스. 매칭 실패 시 null → 슬라이드 없음.
 */
export function resolveCanonicalNavIndex(pathname: string | null): number | null {
  const p = normalizePathForRouteTransition(pathname);
  if (!p || isExcludedFromMainShellTransition(pathname)) return null;

  if (isCommunityHomeSurfacePath(p) || p.startsWith("/philife")) return CANONICAL_NAV_INDICES.philife;
  /** `/community-messenger` 는 `/community` 접두와 충돌 — 반드시 먼저 분기 */
  if (p === "/community-messenger" || p.startsWith("/community-messenger/"))
    return CANONICAL_NAV_INDICES.messenger;
  if (p.startsWith("/community")) return CANONICAL_NAV_INDICES.philife;

  if (p === "/market" || p.startsWith("/market/")) return CANONICAL_NAV_INDICES.market;
  if (p === "/post" || p.startsWith("/post/")) return CANONICAL_NAV_INDICES.market;
  if (p.startsWith("/products/") || p === "/products/new") return CANONICAL_NAV_INDICES.market;
  if (p.startsWith("/write")) return CANONICAL_NAV_INDICES.market;
  if (p.startsWith("/shop/")) return CANONICAL_NAV_INDICES.market;

  if (p === "/stores" || p.startsWith("/stores/")) return CANONICAL_NAV_INDICES.delivery;
  if (p === "/orders" || p.startsWith("/orders/")) return CANONICAL_NAV_INDICES.delivery;

  if (p.startsWith("/chats")) return CANONICAL_NAV_INDICES.messenger;
  if (p === "/chat" || p.startsWith("/chat/")) return CANONICAL_NAV_INDICES.messenger;

  if (p === "/mypage" || p.startsWith("/mypage/")) return CANONICAL_NAV_INDICES.mypage;
  if (p === "/my" || p.startsWith("/my/")) return CANONICAL_NAV_INDICES.mypage;

  return null;
}

/** 메인 5탭 슬라이드 — 하단 탭 전환과 동일 440ms */
export const MAIN_SHELL_ROUTE_TRANSITION_MS = 440;

/**
 * WP4 — 배달 소비자 스택(업종 목록 ↔ 매장) 슬라이드. 배민 실측 약 100~130ms (30fps 녹화).
 * 다른 탭(거래·메신저·내정보)의 440ms 는 바꾸지 않는다.
 */
export const DELIVERY_STACK_SLIDE_MS = 140;
export const DELIVERY_STACK_SLIDE_EASING = "cubic-bezier(0.2, 0, 0, 1)";

/** `/market` cache-hit push — trade-primary·bottom-nav 전용( miss·cross-group 은 440ms 유지) */
export const TRADE_MARKET_CACHE_HIT_PUSH_MS = 250;

export const MAIN_SHELL_ROUTE_TRANSITION_EASING = "cubic-bezier(0.25, 0.9, 0.35, 1)";

export type MainShellRoutePushAxis = "ltr" | "rtl";

/**
 * push 트랙 축 — enter 종류와 1:1.
 * - ltr: 왼쪽 탭 선택 → 새 화면이 왼쪽에서 밀고 들어옴(좌→우)
 * - rtl: 오른쪽 탭 선택 → 새 화면이 오른쪽에서 밀고 들어옴(우→좌)
 */
export function routeTransitionPushAxisForKind(
  kind: RouteTransitionEnterKind
): MainShellRoutePushAxis | null {
  switch (kind) {
    case "ltr-forward":
    case "ltr-back":
    case "store-apply-back":
      return "ltr";
    case "rtl-forward":
    case "rtl-back":
    case "store-apply-forward":
      return "rtl";
    case "profile-edit-forward":
      return "rtl";
    case "profile-edit-back":
      return "ltr";
    case "address-platform-forward":
      return "rtl";
    case "address-platform-back":
      return "ltr";
    case "mypage-stack-forward":
      return "rtl";
    case "mypage-stack-back":
      return "ltr";
    case "none":
    case "subtle":
    case "store-enter-forward":
    case "store-enter-back":
      return null;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export const ROUTE_TRANSITION_ENTER_CLASSES = [
  "main-shell-route-enter-ltr-forward",
  "main-shell-route-enter-rtl-forward",
  "main-shell-route-enter-ltr-back",
  "main-shell-route-enter-rtl-back",
  "main-shell-route-enter-subtle",
  "store-owner-apply-route-enter-rtl-forward",
  "store-owner-apply-route-enter-ltr-back",
  "store-owner-enter-route-enter-up",
  "store-owner-enter-route-exit-down",
  "profile-edit-route-enter-forward",
  "profile-edit-route-enter-back",
  "address-platform-route-enter-forward",
  "address-platform-route-enter-back",
  "mypage-stack-route-enter-forward",
  "mypage-stack-route-enter-back",
] as const;

export const ROUTE_TRANSITION_EXIT_CLASSES = [
  "main-shell-route-exit-ltr",
  "main-shell-route-exit-rtl",
  "store-owner-enter-route-exit-down",
] as const;

export type RouteTransitionEnterClass = (typeof ROUTE_TRANSITION_ENTER_CLASSES)[number];

export function routeTransitionClassForKind(kind: RouteTransitionEnterKind): string | null {
  switch (kind) {
    case "none":
      return null;
    case "subtle":
      return "main-shell-route-enter-subtle";
    case "ltr-forward":
      return "main-shell-route-enter-ltr-forward";
    case "rtl-forward":
      return "main-shell-route-enter-rtl-forward";
    case "ltr-back":
      return "main-shell-route-enter-ltr-back";
    case "rtl-back":
      return "main-shell-route-enter-rtl-back";
    case "store-apply-forward":
      return "store-owner-apply-route-enter-rtl-forward";
    case "store-apply-back":
      return "store-owner-apply-route-enter-ltr-back";
    case "store-enter-forward":
      return "store-owner-enter-route-enter-up";
    case "store-enter-back":
      return null;
    case "profile-edit-forward":
      return "profile-edit-route-enter-forward";
    case "profile-edit-back":
      return "profile-edit-route-enter-back";
    case "address-platform-forward":
      return "address-platform-route-enter-forward";
    case "address-platform-back":
      return "address-platform-route-enter-back";
    case "mypage-stack-forward":
      return "mypage-stack-route-enter-forward";
    case "mypage-stack-back":
      return "mypage-stack-route-enter-back";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** 이전 화면 퇴장 — enter 와 짝을 이뤄 밀고 나가는(push) 체감 */
export function routeTransitionExitClassForKind(kind: RouteTransitionEnterKind): string | null {
  switch (kind) {
    case "ltr-forward":
    case "ltr-back":
    case "store-apply-back":
      return "main-shell-route-exit-ltr";
    case "rtl-forward":
    case "rtl-back":
    case "store-apply-forward":
      return "main-shell-route-exit-rtl";
    case "store-enter-back":
      return "store-owner-enter-route-exit-down";
    case "none":
    case "subtle":
    case "store-enter-forward":
    case "profile-edit-forward":
    case "profile-edit-back":
    case "address-platform-forward":
    case "address-platform-back":
    case "mypage-stack-forward":
    case "mypage-stack-back":
      return null;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** `OwnerStackPageSlideShell` — 270ms 우→좌 / 좌→우 */
export function ownerStackRouteTransitionClassForKind(
  kind: RouteTransitionEnterKind
): string | null {
  switch (kind) {
    case "none":
      return null;
    case "subtle":
      return "owner-stack-route-enter-subtle";
    case "ltr-forward":
    case "rtl-forward":
      return "owner-stack-route-enter-rtl-forward";
    case "ltr-back":
    case "rtl-back":
      return "owner-stack-route-enter-ltr-back";
    case "store-apply-forward":
    case "store-apply-back":
    case "store-enter-forward":
    case "store-enter-back":
    case "profile-edit-forward":
    case "profile-edit-back":
    case "address-platform-forward":
    case "address-platform-back":
    case "mypage-stack-forward":
    case "mypage-stack-back":
      return null;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * 내정보 전환 kind (X2) — push 시간을 `MYPAGE_MOTION_MS.push`(300ms)로 주입하는 대상.
 * 프로필 편집·주소 플랫폼 kind 는 `/mypage/**` 목적지 전용이라 함께 300ms.
 */
export const MYPAGE_STACK_KINDS = ["mypage-stack-forward", "mypage-stack-back"] as const satisfies readonly RouteTransitionEnterKind[];

const MYPAGE_MOTION_KINDS: ReadonlySet<RouteTransitionEnterKind> = new Set<RouteTransitionEnterKind>([
  ...MYPAGE_STACK_KINDS,
  "profile-edit-forward",
  "profile-edit-back",
  "address-platform-forward",
  "address-platform-back",
]);

export function isMypageMotionKind(kind: RouteTransitionEnterKind | null | undefined): boolean {
  return kind != null && MYPAGE_MOTION_KINDS.has(kind);
}

/**
 * 내정보 스택 전환(우→좌 300ms · 역방향) — 1단 헤더는 고정, 본문만 슬라이드 (설계서 §12 「전환 중」).
 * 프로필 편집·주소 플랫폼은 자체 헤더 화면이라 제외. 다른 도메인 kind 는 헤더+본문 한 surface 그대로.
 */
export function isMypageStackHeaderFixedKind(kind: RouteTransitionEnterKind | null | undefined): boolean {
  return kind === "mypage-stack-forward" || kind === "mypage-stack-back";
}
