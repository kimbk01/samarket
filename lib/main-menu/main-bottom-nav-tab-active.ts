import {
  parseMessengerEntryOrigin,
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
} from "@/lib/community-messenger/messenger-entry-origin";
import { isBottomNavTabActive } from "@/lib/main-menu/main-bottom-nav-prefetch-pick";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import type { MainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";

function pathOnly(pathname: string | null): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

function isDeliveryOrdersBottomNavActive(pathname: string | null): boolean {
  const p = pathOnly(pathname);
  if (p === "/orders" || p.startsWith("/orders/")) return true;
  if (p === "/stores/owner/orders" || p.startsWith("/stores/owner/orders/")) return true;
  return false;
}

function isTradeHistoryBottomNavActive(pathname: string | null): boolean {
  const p = pathOnly(pathname);
  if (p === "/mypage/trade/chat" || p.startsWith("/mypage/trade/chat/")) return false;
  if (p === "/mypage/trade" || p.startsWith("/mypage/trade/")) return true;
  if (p === "/mypage/purchases" || p.startsWith("/mypage/purchases/")) return true;
  if (p === "/mypage/sales" || p.startsWith("/mypage/sales/")) return true;
  return false;
}

function isPhilifeMyPostsBottomNavActive(pathname: string | null): boolean {
  const p = pathOnly(pathname);
  return p === "/mypage/community-posts" || p.startsWith("/mypage/community-posts/");
}

function isDeliveryCartBottomNavActive(pathname: string | null): boolean {
  const p = pathOnly(pathname);
  if (p === "/stores/cart") return true;
  return Boolean(p.match(/^\/stores\/[^/]+\/cart\/?$/));
}

function isDeliveryMyBottomNavActive(pathname: string | null): boolean {
  const p = pathOnly(pathname);
  return p === "/mypage/section/store" || p.startsWith("/mypage/section/store/");
}

function isDeliveryHomeHubBottomNavActive(pathname: string | null): boolean {
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
  if (tab.id === "delivery-order-chat") {
    return isMessengerBottomNavChatTabActive(pathname, options?.searchParams, "stores");
  }
  switch (tab.id) {
    case "delivery-orders":
      return isDeliveryOrdersBottomNavActive(pathname);
    case "delivery-cart":
      return isDeliveryCartBottomNavActive(pathname);
    case "delivery-home-hub":
      return isDeliveryHomeHubBottomNavActive(pathname);
    case "delivery-my":
      return isDeliveryMyBottomNavActive(pathname);
    case "trade-history":
      return isTradeHistoryBottomNavActive(pathname);
    case "philife-my-posts":
      return isPhilifeMyPostsBottomNavActive(pathname);
    default:
      return isBottomNavTabActive(pathname, tab.href);
  }
}
