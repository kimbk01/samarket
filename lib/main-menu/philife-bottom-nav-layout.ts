import {
  BOTTOM_NAV_ITEMS,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import { mainBottomNavMessengerTabHref } from "@/lib/community-messenger/messenger-entry-origin";
import { normalizeDeliveryBottomNavPath } from "@/lib/main-menu/delivery-bottom-nav-layout";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";

/** 커뮤니티(필라이프) 셸 하단 5탭 — 거래 · 배달 · 커뮤니티홈 · 메신저 · 내정보 */
export const PHILIFE_BOTTOM_NAV_TAB_IDS = [
  "philife-trade",
  "philife-delivery",
  "philife-home-hub",
  "philife-messenger",
  "philife-my",
] as const;

export type PhilifeBottomNavTabId = (typeof PHILIFE_BOTTOM_NAV_TAB_IDS)[number];

/** 배달 5탭과 동일 라벨 스타일 — `app-bottom-nav.css` `.app-bottom-nav-label--delivery-tab` */
export const PHILIFE_BOTTOM_NAV_LABEL_CLASS =
  "app-bottom-nav-label app-bottom-nav-label--delivery-tab";

export function isPhilifeBottomNavTabId(tabId: string): tabId is PhilifeBottomNavTabId {
  return (PHILIFE_BOTTOM_NAV_TAB_IDS as readonly string[]).includes(tabId);
}

export function isPhilifeBottomNavRail(kind: MainBottomNavSecondaryRailKind): boolean {
  return kind === "philife";
}

/** `/philife`·레거시 `/community` — 커뮤니티 5탭 셸 표면 */
export function isPhilifeConsumerBottomNavSurface(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  if (p === "/philife" || p.startsWith("/philife/")) return true;
  if (p === "/community" || p.startsWith("/community/")) return true;
  return false;
}

/** 커뮤니티 홈(`/philife`·`/community`) — 하단 가운데 「홈」 탭 활성 */
export function isPhilifeHomeHubBottomNavActive(pathname: string | null): boolean {
  return isPhilifeConsumerBottomNavSurface(pathname);
}

function tradeTabFromConfig(): BottomNavItemConfig {
  const base = BOTTOM_NAV_ITEMS.find((t) => t.id === "home");
  return {
    id: "philife-trade",
    href: base?.href ?? "/market",
    label: base?.label ?? "Trade",
    labelKey: base?.labelKey ?? ("nav_bottom_trade" as MessageKey),
    icon: "trade",
  };
}

function deliveryTabFromConfig(): BottomNavItemConfig {
  const base = BOTTOM_NAV_ITEMS.find((t) => t.id === "stores");
  return {
    id: "philife-delivery",
    href: base?.href ?? "/stores",
    label: base?.label ?? "Delivery",
    labelKey: base?.labelKey ?? ("nav_bottom_delivery" as MessageKey),
    icon: "stores",
  };
}

export function composePhilifeBottomNavDisplayTabs(): BottomNavItemConfig[] {
  const community = BOTTOM_NAV_ITEMS.find((t) => t.id === "community");
  const messenger = BOTTOM_NAV_ITEMS.find((t) => t.id === "chat");
  const my = BOTTOM_NAV_ITEMS.find((t) => t.id === "my");

  return [
    tradeTabFromConfig(),
    deliveryTabFromConfig(),
    {
      id: "philife-home-hub",
      href: community?.href ?? "/philife",
      label: community?.label ?? "Community",
      labelKey: community?.labelKey ?? ("nav_bottom_community" as MessageKey),
      icon: "community",
    },
    {
      id: "philife-messenger",
      href: mainBottomNavMessengerTabHref("community"),
      label: messenger?.label ?? "Messenger",
      labelKey: messenger?.labelKey ?? ("nav_bottom_messenger" as MessageKey),
      icon: "chat",
      ...(messenger?.activeShellClass ? { activeShellClass: messenger.activeShellClass } : {}),
      ...(messenger?.iconActiveClass ? { iconActiveClass: messenger.iconActiveClass } : {}),
      ...(messenger?.labelActiveClass ? { labelActiveClass: messenger.labelActiveClass } : {}),
    },
    {
      id: "philife-my",
      href: my?.href ?? "/mypage",
      label: my?.label ?? "My Page",
      labelKey: my?.labelKey ?? ("nav_bottom_my" as MessageKey),
      icon: "my",
    },
  ];
}
