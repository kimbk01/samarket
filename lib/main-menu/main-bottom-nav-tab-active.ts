import {
  parseMessengerEntryOrigin,
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
} from "@/lib/community-messenger/messenger-entry-origin";
import { isBottomNavTabActive } from "@/lib/main-menu/main-bottom-nav-prefetch-pick";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import type { MainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";
import {
  isDeliveryCartBottomNavPath,
  isDeliveryOrderHistoryBottomNavPath,
  normalizeDeliveryBottomNavPath,
} from "@/lib/main-menu/delivery-bottom-nav-layout";
import { isPhilifeHomeHubBottomNavActive } from "@/lib/main-menu/philife-bottom-nav-layout";
import {
  isTradeFavoritesBottomNavPath,
  isTradeHistoryBottomNavPath,
  isTradeHomeHubBottomNavActive,
} from "@/lib/main-menu/trade-bottom-nav-layout";

function pathOnly(pathname: string | null): string {
  return normalizeDeliveryBottomNavPath(pathname);
}

function isPhilifeMyPostsBottomNavActive(pathname: string | null): boolean {
  const p = pathOnly(pathname);
  return p === "/mypage/community-posts" || p.startsWith("/mypage/community-posts/");
}

function isDeliveryCartBottomNavActive(pathname: string | null): boolean {
  return isDeliveryCartBottomNavPath(pathname);
}

/** 거래 하단 「내정보」(`/mypage`) 와 동일 — 주문내역 탭 전용 경로만 제외 */
function isDeliveryMyBottomNavActive(pathname: string | null): boolean {
  if (isDeliveryOrderHistoryBottomNavPath(pathname)) return false;
  return isBottomNavTabActive(pathname, "/mypage");
}

/** 거래 하단 「내정보」 — 내역·찜 전용 경로 제외 */
function isTradeMyBottomNavActive(pathname: string | null): boolean {
  if (isTradeHistoryBottomNavPath(pathname)) return false;
  if (isTradeFavoritesBottomNavPath(pathname)) return false;
  return isBottomNavTabActive(pathname, "/mypage");
}

/** 배달 홈(`/stores`·검색·browse) — 하단 「홈」 탭·다이얼 「배달」 칩 활성/재탭 스크롤 판정 */
export function isDeliveryHomeHubBottomNavActive(pathname: string | null): boolean {
  const p = pathOnly(pathname);
  if (p === "/stores") return true;
  if (p === "/stores/search" || p.startsWith("/stores/search/")) return true;
  if (p === "/stores/browse" || p.startsWith("/stores/browse/")) return true;
  return false;
}

function isMessengerBottomNavChatTabActive(
  pathname: string | null,
  searchParams: { get: (key: string) => string | null } | null | undefined,
  rail: MainBottomNavSecondaryRailKind
): boolean {
  const p = pathOnly(pathname);
  if (!p.startsWith("/community-messenger")) return false;
  const from = parseMessengerEntryOrigin(searchParams?.get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY));
  if (rail === "stores") {
    return (
      p === "/community-messenger/delivery-chats" ||
      p.startsWith("/community-messenger/delivery-chats/") ||
      from === "delivery"
    );
  }
  if (rail === "trade") {
    return (
      p === "/community-messenger/trade-chats" ||
      p.startsWith("/community-messenger/trade-chats/") ||
      from === "trade"
    );
  }
  if (p.includes("/trade-chats") || p.includes("/delivery-chats")) return false;
  return from === "community" || from === null;
}

/** 분할 하단 탭 활성 — `BottomNav`·프리페치 제외와 동일 규칙 */
export function isMainBottomNavDisplayTabActive(
  pathname: string | null,
  tab: BottomNavItemConfig,
  options?: {
    searchParams?: { get: (key: string) => string | null } | null;
    secondaryRail?: MainBottomNavSecondaryRailKind;
  }
): boolean {
  if (tab.id === "chat" && options?.secondaryRail) {
    return isMessengerBottomNavChatTabActive(pathname, options.searchParams, options.secondaryRail);
  }
  if (tab.id === "delivery-order-chat" || tab.id === "philife-messenger" || tab.id === "trade-order-chat") {
    return isMessengerBottomNavChatTabActive(
      pathname,
      options?.searchParams,
      tab.id === "philife-messenger" ? "philife" : tab.id === "trade-order-chat" ? "trade" : "stores"
    );
  }
  switch (tab.id) {
    case "trade-history":
      return isTradeHistoryBottomNavPath(pathname);
    case "trade-favorites":
      return isTradeFavoritesBottomNavPath(pathname);
    case "trade-home-hub":
      return isTradeHomeHubBottomNavActive(pathname);
    case "trade-my":
      return isTradeMyBottomNavActive(pathname);
    case "philife-trade":
      return isBottomNavTabActive(pathname, "/market");
    case "philife-delivery":
      return isBottomNavTabActive(pathname, "/stores");
    case "philife-home-hub":
      return isPhilifeHomeHubBottomNavActive(pathname);
    case "philife-my":
      return isBottomNavTabActive(pathname, "/mypage");
    case "delivery-orders":
      return isDeliveryOrderHistoryBottomNavPath(pathname);
    case "delivery-cart":
      return isDeliveryCartBottomNavActive(pathname);
    case "delivery-home-hub":
      return isDeliveryHomeHubBottomNavActive(pathname);
    case "delivery-my":
      return isDeliveryMyBottomNavActive(pathname);
    case "philife-my-posts":
      return isPhilifeMyPostsBottomNavActive(pathname);
    default:
      return isBottomNavTabActive(pathname, tab.href);
  }
}
