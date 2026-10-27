import { isPhilifeFeedHubPath } from "@/lib/philife/philife-hub-path";
import { isTradeSearchPath } from "@/lib/trade/search/trade-search-paths";
import { isMypageHomePath } from "@/lib/mypage/mypage-profile-routes";

/** 메인 5탭 허브 본문 — 탭(60px) + safe-area. 셸 `pb-0` 과 반드시 쌍 */
export const MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS =
  "pb-[calc(var(--app-bottom-nav-height,60px)+var(--safe-bottom))]";

/**
 * Messenger list scrollport inset — SAME length as hub clearance.
 * Apply ONLY on `[data-messenger-hub-list-scroll]` (not outer shell).
 * DO NOT toggle with scroll-hide — hide is transform-only; inset follows mount.
 */
export const MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS =
  MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS;

function normalizeHubPath(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
}

function isMarketTradeFeedHubPath(pathname: string): boolean {
  if (pathname === "/market/trade-meet-spot" || pathname.startsWith("/market/trade-meet-spot/")) {
    return false;
  }
  if (pathname === "/market/location" || pathname.startsWith("/market/location/")) {
    return false;
  }
  if (isTradeSearchPath(pathname)) return false;
  return pathname === "/market" || pathname.startsWith("/market/");
}

function isMypageTradeHubPath(pathname: string): boolean {
  if (pathname === "/mypage/trade") return true;
  return pathname.startsWith("/mypage/trade/") && !/^\/mypage\/trade\/chat\//.test(pathname);
}

/**
 * 배달 5탭 소비자 허브 — `delivery-bottom-nav-layout` 와 동치.
 * `bottom-nav-config` → `app-content-layout` 순환 import 를 피하기 위해 여기만 중복 정의.
 */
function isDeliveryConsumerHubBodyClearancePath(pathname: string): boolean {
  const p = normalizeHubPath(pathname);
  if (p === "/stores/owner" || p.startsWith("/stores/owner/")) return false;
  if (p === "/orders" || p.startsWith("/orders/")) return true;
  /**
   * `/mypage/store-orders(/*)` 는 제외 — 본문이 내정보 `MyScreen`(하단탭 여백 없음)이라 셸 `<main>` 이
   * 탭+안전영역 여백을 준다 (설계서 v3 §4 ④ · 부록 C #34). 배달 `/orders` 판정은 그대로.
   */
  if (isMypageStoreOrdersPath(p)) return false;
  if (p === "/stores/cart") return true;
  if (p === "/stores/search" || p.startsWith("/stores/search/")) return true;
  if (p === "/stores/browse" || p.startsWith("/stores/browse/")) return true;
  return false;
}

/** 내정보 매장 주문 목록·상세 (`/my/*` 별칭 포함) */
export function isMypageStoreOrdersPath(pathname: string | null | undefined): boolean {
  const p = normalizeHubPath(pathname);
  return (
    p === "/mypage/store-orders" ||
    p.startsWith("/mypage/store-orders/") ||
    p === "/my/store-orders" ||
    p.startsWith("/my/store-orders/")
  );
}

/** 셸 `mainBottomClass=pb-0` — 본문이 clearance 를 직접 갖는 허브·피드만 */
export function isMainBottomNavHubBodyClearancePath(pathname: string | null | undefined): boolean {
  const p = normalizeHubPath(pathname);
  if (isPhilifeFeedHubPath(pathname)) return true;
  if (isMypageHomePath(pathname)) return true;
  if (isMypageTradeHubPath(p)) return true;
  /** Messenger hub + trade/delivery list pillars — shell pb-0; body clearance via Provider only */
  if (p === "/community-messenger") return true;
  if (p === "/community-messenger/trade-chats") return true;
  if (p === "/community-messenger/delivery-chats") return true;
  if (p === "/stores") return true;
  if (isMarketTradeFeedHubPath(p)) return true;
  return isDeliveryConsumerHubBodyClearancePath(p);
}

/** 탭이 없는 화면 본문 하단 — safe-bottom 1회 (셸은 `pb-4` 또는 `pb-0`) */
export const NO_BOTTOM_NAV_BODY_SAFE_CLASS = "pb-[var(--safe-bottom)]";

/**
 * 본문 하단 여백 SSOT (H-02) — 탭 표시 판정은 실제 마운트(`useBottomNavOccupiesClearance`)만 사용.
 * - 허브 본문 소유 경로 + 탭 표시 → 탭(60) + safe (셸 `pb-0` 과 쌍)
 * - 탭 없음 → safe 1회 (탭 여백을 두지 않는다)
 * - 탭 있음 + 셸 소유 경로 → 본문 추가 여백 없음
 */
export function resolveBodyBottomNavClearanceClass(
  pathname: string | null | undefined,
  navOccupiesClearance: boolean
): string {
  if (!navOccupiesClearance) return NO_BOTTOM_NAV_BODY_SAFE_CLASS;
  if (isMainBottomNavHubBodyClearancePath(pathname)) return MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS;
  return "";
}
