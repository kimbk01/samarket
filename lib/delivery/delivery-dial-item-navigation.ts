import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { DELIVERY_HOME_HUB_HREF } from "@/lib/delivery/delivery-home-hub-navigation";
import { isDeliveryHomeHubBottomNavActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";
import { persistMessengerEntryOrigin } from "@/lib/community-messenger/messenger-entry-origin";

export type DeliveryDialNavigateArgs = {
  tab: BottomNavItemConfig;
  href: string;
  pathname: string | null;
  onClose: () => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  push: (href: string) => void;
  goBusinessHubOrModal: (href: string) => void;
  shouldInterceptBusinessHubHref: (href: string) => boolean;
};

/**
 * 다이얼 칩 선택 후 이동 — `stores` 는 배달 홈이 아닐 때만 `/stores` 로 push.
 * @returns false면 guard/인증 등으로 중단(호출부에서 onClose 하지 않음).
 */
export function runDeliveryDialItemNavigation(args: DeliveryDialNavigateArgs): boolean {
  const { tab, href, pathname, onClose, guardBeforeNavigate, push, goBusinessHubOrModal, shouldInterceptBusinessHubHref } =
    args;

  if (tab.id === "stores") {
    onClose();
    if (isDeliveryHomeHubBottomNavActive(pathname)) {
      scrollAppShellToTop();
      return true;
    }
    if (!guardBeforeNavigate(DELIVERY_HOME_HUB_HREF)) {
      return false;
    }
    persistMessengerEntryOrigin("delivery");
    push(DELIVERY_HOME_HUB_HREF);
    return true;
  }

  if (!guardBeforeNavigate(href)) {
    return false;
  }

  if (tab.id === "delivery-ops-center") {
    onClose();
    if (shouldInterceptBusinessHubHref(href)) {
      goBusinessHubOrModal(href);
    } else {
      push(href);
    }
    return true;
  }

  if (href.includes("/community-messenger")) {
    persistMessengerEntryOrigin("delivery");
  }

  onClose();
  push(href);
  return true;
}
