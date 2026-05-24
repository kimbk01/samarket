import { isDeliveryHomeHubBottomNavActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import {
  commitMainBottomNavRoute,
  type MainBottomNavRouteCommitArgs,
} from "@/lib/main-menu/main-bottom-nav-route-commit";

export const DELIVERY_HOME_HUB_HREF = "/stores";

/** 롱프레스 — 배달 홈(`/stores`)으로 이동(이미 실홈이면 맨 위 스크롤) */
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
  replace: (href: string) => void;
  prefetch?: (href: string) => void;
  onPrewarm?: () => void;
};

export type DeliveryHomeHubShortTapArgs = DeliveryHomeHubNavigateArgs & {
  longPressFired: boolean;
  onToggleSwitcher: () => void;
};

function deliveryHomeHubHref(args: DeliveryHomeHubNavigateArgs): string {
  return (args.href ?? DELIVERY_HOME_HUB_HREF).trim() || DELIVERY_HOME_HUB_HREF;
}

function baseCommitArgs(args: DeliveryHomeHubNavigateArgs): Omit<
  MainBottomNavRouteCommitArgs,
  "href" | "tabId"
> {
  return {
    pathname: args.pathname,
    currentSearch: args.currentSearch,
    beginMenuNavigation: args.beginMenuNavigation,
    onNavigationIntent: args.onNavigationIntent,
    guardBeforeNavigate: args.guardBeforeNavigate,
    push: args.push,
    replace: args.replace,
    prefetch: args.prefetch,
    onPrewarm: args.onPrewarm,
    onCloseDomainSwitcher: args.switcherOpen ? args.onCloseSwitcher : undefined,
  };
}

/** 롱프레스·다이얼 「배달」칩과 동일 — `/stores` 즉시 이동(동일 페이지면 스크롤) */
export function runDeliveryHomeHubNavigateToStores(args: DeliveryHomeHubNavigateArgs): boolean {
  const href = deliveryHomeHubHref(args);
  const result = commitMainBottomNavRoute({
    ...baseCommitArgs(args),
    href,
    tabId: "delivery-home-hub",
    prefetchWhenInactive: !shouldSkipHomeHubPrewarm(args.pathname, href),
  });
  return result !== "blocked";
}

function shouldSkipHomeHubPrewarm(pathname: string | null, href: string): boolean {
  if (!isDeliveryHomeHubBottomNavActive(pathname)) return false;
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  return p === href.split("?")[0]?.trim();
}

/**
 * 하단 홈 **짧은 탭** — 도메인 다이얼 열기/닫기 (페이지 이동 없음).
 * 배달 실홈(`/stores`) 이동은 **롱프레스**만.
 */
export function runDeliveryHomeHubShortTap(args: DeliveryHomeHubShortTapArgs): boolean {
  if (args.longPressFired) return true;
  if (args.switcherOpen) {
    args.onCloseSwitcher();
  } else {
    args.onToggleSwitcher();
  }
  return true;
}

/** 롱프레스 — `/stores`(또는 동일 경로면 스크롤만) */
export function runDeliveryHomeHubLongPress(args: DeliveryHomeHubNavigateArgs): boolean {
  return runDeliveryHomeHubNavigateToStores(args);
}