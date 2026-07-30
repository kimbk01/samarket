import { isPhilifeFeedHubPath } from "@/lib/philife/philife-hub-path";
import { isMypageHomePath } from "@/lib/mypage/mypage-profile-routes";

/** 메인 5탭 허브 본문 — 탭(60px) + safe-area. 셸 `pb-0` 과 반드시 쌍 */
export const MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS =
  "pb-[calc(60px+var(--safe-bottom))]";

function normalizeHubPath(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
}

function isMarketTradeFeedHubPath(pathname: string): boolean {
  if (pathname === "/market/trade-meet-spot" || pathname.startsWith("/market/trade-meet-spot/")) {
    return false;
  }
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
  if (p === "/mypage/store-orders" || p.startsWith("/mypage/store-orders/")) return true;
  if (p === "/my/store-orders" || p.startsWith("/my/store-orders/")) return true;
  if (p === "/stores/cart") return true;
  if (p === "/stores/search" || p.startsWith("/stores/search/")) return true;
  if (p === "/stores/browse" || p.startsWith("/stores/browse/")) return true;
  return false;
}

/** 셸 `mainBottomClass=pb-0` — 본문이 clearance 를 직접 갖는 허브·피드만 */
export function isMainBottomNavHubBodyClearancePath(pathname: string | null | undefined): boolean {
  const p = normalizeHubPath(pathname);
  if (isPhilifeFeedHubPath(pathname)) return true;
  if (isMypageHomePath(pathname)) return true;
  if (isMypageTradeHubPath(p)) return true;
  if (p === "/community-messenger") return true;
  if (p === "/stores") return true;
  if (isMarketTradeFeedHubPath(p)) return true;
  return isDeliveryConsumerHubBodyClearancePath(p);
}
