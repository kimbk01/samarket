import {
  BOTTOM_NAV_ITEMS,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import {
  mainBottomNavMessengerTabHref,
  messengerEntryOriginToSecondaryRail,
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
  parseMessengerEntryOrigin,
  readStoredMessengerEntryOrigin,
} from "@/lib/community-messenger/messenger-entry-origin";
import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";
import { resolveDeliveryOrderHistoryHref } from "@/lib/stores/delivery-order-history-nav";
import type { MessageKey } from "@/lib/i18n/messages";

/** 하단 좌측 고정 3탭 — 커뮤니티 · 거래 · 배달 */
export const MAIN_BOTTOM_NAV_PRIMARY_TAB_IDS = ["community", "home", "stores"] as const;

export type MainBottomNavSecondaryRailKind = "stores" | "trade" | "philife";

function messengerTabForRail(kind: MainBottomNavSecondaryRailKind): BottomNavItemConfig {
  const origin = kind === "stores" ? "delivery" : kind === "trade" ? "trade" : "community";
  return {
    id: "chat",
    href: mainBottomNavMessengerTabHref(origin),
    label: "Messenger",
    labelKey: "nav_bottom_messenger",
    icon: "chat",
    activeShellClass: "bg-sam-primary-soft",
    iconActiveClass: "text-sam-primary",
    labelActiveClass: "font-semibold tracking-normal text-sam-fg",
  };
}

const MY_TAB_BASE: BottomNavItemConfig = {
  id: "my",
  href: "/mypage",
  label: "My Page",
  labelKey: "nav_bottom_my",
  icon: "my",
};

function pickPrimaryTabs(source: readonly BottomNavItemConfig[]): BottomNavItemConfig[] {
  const defaults = BOTTOM_NAV_ITEMS.filter((t) =>
    (MAIN_BOTTOM_NAV_PRIMARY_TAB_IDS as readonly string[]).includes(t.id)
  );
  const fromSource = MAIN_BOTTOM_NAV_PRIMARY_TAB_IDS.map((id) => source.find((t) => t.id === id)).filter(
    (t): t is BottomNavItemConfig => t != null
  );
  return fromSource.length === MAIN_BOTTOM_NAV_PRIMARY_TAB_IDS.length ? fromSource : defaults;
}

function secondaryTabsForRail(kind: MainBottomNavSecondaryRailKind): BottomNavItemConfig[] {
  switch (kind) {
    case "stores":
      return [
        {
          id: "delivery-orders",
          href: resolveDeliveryOrderHistoryHref(null),
          label: "Order history",
          labelKey: "nav_bottom_order_history" as MessageKey,
          icon: "orders",
        },
        messengerTabForRail("stores"),
        { ...MY_TAB_BASE },
      ];
    case "trade":
      return [
        {
          id: "trade-history",
          href: "/mypage/trade",
          label: "Trade history",
          labelKey: "nav_trade_history" as MessageKey,
          icon: "orders",
        },
        messengerTabForRail("trade"),
        { ...MY_TAB_BASE },
      ];
    case "philife":
      return [
        {
          id: "philife-my-posts",
          href: "/mypage/community-posts",
          label: "My posts",
          labelKey: "nav_bottom_my_posts" as MessageKey,
          icon: "community",
        },
        messengerTabForRail("philife"),
        { ...MY_TAB_BASE },
      ];
  }
}

/** 현재 셸에 맞는 우측 3탭 레일 */
export function resolveMainBottomNavSecondaryRailKind(
  pathname: string | null,
  searchParams?: { get: (key: string) => string | null } | null
): MainBottomNavSecondaryRailKind {
  const raw = (pathname ?? "").split("?")[0]?.trim() ?? "";
  const p = raw.replace(/\/+$/, "") || "/";
  const domain = mainBottomNavPrefetchTriggerKey(pathname);

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
    if (p === "/orders" || p.startsWith("/orders/")) return "stores";
    return "philife";
  }

  return "trade";
}

/** 하단 6탭 — 좌(커뮤니티·거래·배달) + 우(도메인별 3탭) */
export function composeMainBottomNavDisplayTabs(
  pathname: string | null,
  sourceTabs: readonly BottomNavItemConfig[],
  searchParams?: { get: (key: string) => string | null } | null
): BottomNavItemConfig[] {
  const primary = pickPrimaryTabs(sourceTabs);
  const secondary = secondaryTabsForRail(resolveMainBottomNavSecondaryRailKind(pathname, searchParams));
  return [...primary, ...secondary];
}
