import {
  BOTTOM_NAV_ITEMS,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import {
  messengerEntryOriginToSecondaryRail,
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
  parseMessengerEntryOrigin,
  readStoredMessengerEntryOrigin,
} from "@/lib/community-messenger/messenger-entry-origin";
import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";
import {
  isDeliveryBottomNavRail,
  isDeliveryConsumerBottomNavSurface,
  isDeliveryOrderHistoryBottomNavPath,
  normalizeDeliveryBottomNavPath,
} from "@/lib/main-menu/delivery-bottom-nav-layout";
import {
  isPhilifeBottomNavRail,
} from "@/lib/main-menu/philife-bottom-nav-layout";
import {
  isTradeBottomNavRail,
} from "@/lib/main-menu/trade-bottom-nav-layout";
import {
  mypageBottomNavOriginToSecondaryRail,
  readStoredMypageBottomNavOrigin,
} from "@/lib/main-menu/mypage-bottom-nav-origin";

/** 하단 좌측 고정 3탭 — 커뮤니티 · 거래 · 배달 (레거시 6탭 분할용) */
export const MAIN_BOTTOM_NAV_PRIMARY_TAB_IDS = ["community", "home", "stores"] as const;

export type MainBottomNavSecondaryRailKind = "stores" | "trade" | "philife";

/** 현재 셸에 맞는 우측 3탭 레일 */
export function resolveMainBottomNavSecondaryRailKind(
  pathname: string | null,
  searchParams?: { get: (key: string) => string | null } | null
): MainBottomNavSecondaryRailKind {
  const p = normalizeDeliveryBottomNavPath(pathname);
  const domain = mainBottomNavPrefetchTriggerKey(pathname);

  if (isDeliveryConsumerBottomNavSurface(p)) {
    return "stores";
  }

  if (domain === "messenger") {
    if (p === "/community-messenger/trade-chats" || p.startsWith("/community-messenger/trade-chats/")) {
      return "trade";
    }
    if (p === "/community-messenger/delivery-chats" || p.startsWith("/community-messenger/delivery-chats/")) {
      return "stores";
    }
    const from =
      parseMessengerEntryOrigin(searchParams?.get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY)) ??
      (typeof window !== "undefined" ? readStoredMessengerEntryOrigin() : null);
    return messengerEntryOriginToSecondaryRail(from);
  }

  if (domain === "stores" || domain === "store_owner") return "stores";
  if (domain === "trade") return "trade";
  if (domain === "philife") return "philife";

  if (domain === "my") {
    if (isDeliveryOrderHistoryBottomNavPath(p)) {
      return "stores";
    }
    if (p === "/mypage/section/store" || p.startsWith("/mypage/section/store/")) {
      return "stores";
    }
    if (
      p === "/mypage/trade" ||
      p.startsWith("/mypage/trade/") ||
      p === "/mypage/purchases" ||
      p.startsWith("/mypage/purchases/") ||
      p === "/mypage/sales" ||
      p.startsWith("/mypage/sales/")
    ) {
      return "trade";
    }
    if (p === "/mypage/community-posts" || p.startsWith("/mypage/community-posts/")) {
      return "philife";
    }
    return mypageBottomNavOriginToSecondaryRail(readStoredMypageBottomNavOrigin());
  }

  return "trade";
}

/**
 * 하단 표시 탭 — admin `/admin/menus/main-bottom-nav` 노출 순서·라벨·href 와 동일.
 * `MainBottomNavTabsProvider` 가 resolve 한 `sourceTabs`(visible 만)를 그대로 쓴다.
 */
export function composeMainBottomNavDisplayTabs(
  _pathname: string | null,
  sourceTabs: readonly BottomNavItemConfig[],
  _searchParams?: { get: (key: string) => string | null } | null,
  _ownerStoreId?: string | null
): BottomNavItemConfig[] {
  const base = sourceTabs.length > 0 ? sourceTabs : BOTTOM_NAV_ITEMS;
  return base.map((row) => ({ ...row }));
}
