import { isDeliveryHomeHubBottomNavActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";

export const DELIVERY_HOME_HUB_HREF = "/stores";

/**
 * 하단 「홈」 짧은 탭 — 배달 홈으로 이동. 이미 홈 경로면 스크롤만.
 * @returns true면 라우터 push 가 호출됐거나 스크롤만 처리됨(호출부에서 추가 push 불필요).
 */
export function runDeliveryHomeHubShortTap(args: {
  pathname: string | null;
  currentSearch: string;
  href?: string;
  switcherOpen: boolean;
  onCloseSwitcher: () => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  beginMenuNavigation: (href: string) => void;
  onNavigationIntent: (tabId: string) => void;
  push: (href: string) => void;
}): boolean {
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
