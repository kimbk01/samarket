import { scrollAppShellToTop } from "@/lib/layout/scroll-app-shell-to-top";

const OWNER_DASHBOARD_PATH = "/stores/owner";

function ownerDashboardPath(pathname: string | null): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

/** 오너 하단 「홈」— 운영 대시보드(`/stores/owner`) 활성·재탭 스크롤 */
export function isOwnerHomeHubBottomNavActive(pathname: string | null): boolean {
  return ownerDashboardPath(pathname) === OWNER_DASHBOARD_PATH;
}

/**
 * 오너 하단 「홈」 탭 — `/stores/owner` 대시보드로 이동(다른 운영 화면에서 탭할 때).
 * 이미 허브면 UI 가 다이얼 토글.
 */
export function runOwnerHomeHubShortTap(args: {
  pathname: string | null;
  href: string;
  switcherOpen: boolean;
  onCloseSwitcher: () => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
  onNavigationIntent: () => void;
  push: (href: string) => void;
}): boolean {
  const href = args.href.trim();
  if (!href) return false;

  if (args.switcherOpen) {
    args.onCloseSwitcher();
  }

  if (isOwnerHomeHubBottomNavActive(args.pathname)) {
    const targetPath = href.split("?")[0]?.trim().replace(/\/+$/, "") || "/";
    if (ownerDashboardPath(args.pathname) === targetPath) {
      scrollAppShellToTop();
      return true;
    }
  }

  if (!args.guardBeforeNavigate(href)) {
    return false;
  }

  args.onNavigationIntent();
  args.push(href);
  return true;
}
