/**
 * 메인 셸 포털형 슬라이드 — canonical 탭 사다리(제품 확정).
 * 하단 탭 배열 순서와 무관하게 pathname 만으로 방향을 맞춘다.
 */

import { isCommunityMessengerRoomPathname } from "@/lib/layout/conditional-app-shell-flags";

export { shouldSuppressOwnerStackMainShellSlide } from "@/lib/business/owner-stack-path";

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
  | "store-apply-back";

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
 * Canonical 인덱스. 매칭 실패 시 null → 슬라이드 없음.
 */
export function resolveCanonicalNavIndex(pathname: string | null): number | null {
  const p = normalizePathForRouteTransition(pathname);
  if (!p || isExcludedFromMainShellTransition(pathname)) return null;

  if (p === "/" || p.startsWith("/philife")) return CANONICAL_NAV_INDICES.philife;
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
    case "none":
    case "subtle":
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
] as const;

export const ROUTE_TRANSITION_EXIT_CLASSES = [
  "main-shell-route-exit-ltr",
  "main-shell-route-exit-rtl",
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
    case "none":
    case "subtle":
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
      return null;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
