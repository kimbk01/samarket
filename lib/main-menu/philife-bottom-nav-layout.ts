import {
  BOTTOM_NAV_ITEMS,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import { mainBottomNavMessengerTabHref } from "@/lib/community-messenger/messenger-entry-origin";
import { normalizeDeliveryBottomNavPath } from "@/lib/main-menu/delivery-bottom-nav-layout";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";

/** 커뮤니티(필라이프) 셸 하단 5탭 — 홈 · 거래 · 배달 · 디바톡 · 내정보 */
export const PHILIFE_BOTTOM_NAV_TAB_IDS = [
  "philife-home-hub",
  "philife-trade",
  "philife-delivery",
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

/** `/` · `/philife` · 레거시 `/community` — 커뮤니티 5탭 셸 표면 */
export function isPhilifeConsumerBottomNavSurface(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  if (p === "/" || p === "/philife" || p.startsWith("/philife/")) return true;
  if (p === "/community" || p.startsWith("/community/")) return true;
  return false;
}

/** 커뮤니티 홈(`/` · `/philife` · `/community`) — 하단 「홈」 탭 활성 */
export function isPhilifeHomeHubBottomNavActive(pathname: string | null): boolean {
  return isPhilifeConsumerBottomNavSurface(pathname);
}

function tradeTabFromConfig(): BottomNavItemConfig {
  const base = BOTTOM_NAV_ITEMS.find((t) => t.id === "home");
  return {
    id: "philife-trade",
    href: base?.href ?? "/market",
    label: base?.label ?? "Trade",
    labelKey: base?.labelKey ?? ("nav.trade" as MessageKey),
    icon: "trade",
  };
}

function deliveryTabFromConfig(): BottomNavItemConfig {
  const base = BOTTOM_NAV_ITEMS.find((t) => t.id === "stores");
  return {
    id: "philife-delivery",
    href: base?.href ?? "/stores",
    label: base?.label ?? "Delivery",
    labelKey: base?.labelKey ?? ("nav.delivery" as MessageKey),
    icon: "stores",
  };
}

export function composePhilifeBottomNavDisplayTabs(): BottomNavItemConfig[] {
  const community = BOTTOM_NAV_ITEMS.find((t) => t.id === "community");
  const my = BOTTOM_NAV_ITEMS.find((t) => t.id === "my");

  return [
    {
      id: "philife-home-hub",
      href: community?.href ?? "/philife",
      label: "Home",
      labelKey: "nav.home" as MessageKey,
      icon: "community",
    },
    tradeTabFromConfig(),
    deliveryTabFromConfig(),
    {
      id: "philife-messenger",
      href: mainBottomNavMessengerTabHref("community"),
      label: "Chat",
      labelKey: "nav.chat" as MessageKey,
      icon: "chat",
    },
    {
      id: "philife-my",
      href: my?.href ?? "/mypage",
      label: my?.label ?? "My",
      labelKey: my?.labelKey ?? ("nav.my" as MessageKey),
      icon: "my",
    },
  ];
}
