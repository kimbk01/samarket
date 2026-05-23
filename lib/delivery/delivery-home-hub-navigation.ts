import { isDeliveryHomeHubBottomNavActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";

export const DELIVERY_HOME_HUB_HREF = "/stores";

/** 하단 홈 롱프레스 — 다이얼 닫고 배달 실홈(`/stores`)으로 이동(이미 홈이면 맨 위 스크롤) */
export const DELIVERY_HOME_HUB_LONG_PRESS_MS = 480;

export type DeliveryHomeHubNavigateArgs = {
  pathname: string | null;
  currentSearch: string;
  href?: string;
  switcherOpen: boolean;
  onCloseSwitcher: () => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  beginMenuNavigation: (href: string) => void;
  onNavigationIntent: (tabId: string) => void;
  push: (href: string) => void;
};

/**
 * @deprecated 하단 홈 **짧은 탭**은 다이얼만 토글한다. 실홈 이동은 `runDeliveryHomeHubLongPress` 만 사용.
 */
export function runDeliveryHomeHubShortTap(args: DeliveryHomeHubNavigateArgs): boolean {
  return runDeliveryHomeHubLongPress(args);
}

/** 롱프레스 — 배달 다이얼 닫기 + `/stores`(또는 동일 경로면 스크롤만) */
export function runDeliveryHomeHubLongPress(args: DeliveryHomeHubNavigateArgs): boolean {
  const href = (args.href ?? DELIVERY_HOME_HUB_HREF).trim() || DELIVERY_HOME_HUB_HREF;

  if (args.switcherOpen) {
    args.onCloseSwitcher();
  }

  if (isDeliveryHomeHubBottomNavActive(args.pathname)) {
    const p = (args.pathname ?? "").split("?")[0]?.trim() ?? "";
    if (p === href.split("?")[0]?.trim()) {
      scrollAppShellToTop();
      return true;
    }
  }

  if (!args.guardBeforeNavigate(href)) {
    return false;
  }

  args.beginMenuNavigation(href);
  args.onNavigationIntent("delivery-home-hub");
  args.push(href);
  return true;
}
