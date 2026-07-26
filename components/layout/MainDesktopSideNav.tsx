"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MainBottomNavTabIcon } from "@/components/main-menu/MainBottomNavTabIcon";
import { useMainBottomNavTabs } from "@/contexts/MainBottomNavTabsContext";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import { useOwnerNavigationSummary } from "@/lib/delivery/owner/projections/use-owner-navigation-summary";
import { useOwnerHubBadgeTabUnreadCount } from "@/lib/chats/use-owner-hub-badge-total";
import { composeMainBottomNavDisplayTabs, resolveMainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";
import {
  resolveMainBottomNavTabEmphasisKind,
  resolveMainBottomNavTabTapHref,
} from "@/lib/main-menu/main-bottom-nav-tab-emphasis";
import { isMainBottomNavDisplayTabActive } from "@/lib/main-menu/main-bottom-nav-tab-active";
import { commitBottomNavTabRoute } from "@/components/layout/BottomNav";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { syncMypageBottomNavContextFromPath } from "@/lib/main-menu/mypage-bottom-nav-origin";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

function DesktopSideNavItem({
  tab,
  pathname,
  navSearch,
  pendingActiveTabId,
  onNavigationIntent,
  beginMenuNavigation,
  guardBeforeNavigate,
}: {
  tab: BottomNavItemConfig;
  pathname: string | null;
  navSearch: string;
  pendingActiveTabId: string | null;
  onNavigationIntent: (tabId: string) => void;
  beginMenuNavigation: ReturnType<typeof useLatestMenuNavigation>["beginMenuNavigation"];
  guardBeforeNavigate: (nextHref?: string) => boolean;
}) {
  const { safeT, tt, t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ownerNav = useOwnerNavigationSummary();
  const tabBadgeCount = useOwnerHubBadgeTabUnreadCount(tab.icon);
  const tabLabel = tab.labelKey ? safeT(tab.labelKey) : tt(tab.label);
  const secondaryRail = useMemo(
    () => resolveMainBottomNavSecondaryRailKind(pathname, searchParams),
    [pathname, searchParams]
  );
  const emphasisKind = resolveMainBottomNavTabEmphasisKind(tab.id, pathname);
  const isActive =
    pendingActiveTabId != null
      ? tab.id === pendingActiveTabId
      : isMainBottomNavDisplayTabActive(pathname, tab, { searchParams, secondaryRail });
  const href = useMemo(
    () =>
      resolveMainBottomNavTabTapHref(tab.id, tab.href, {
        emphasisKind,
        pathname,
        searchParams,
        ownerStoreId: ownerNav.storeId,
      }),
    [tab.id, tab.href, pathname, searchParams, ownerNav.storeId, emphasisKind]
  );

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    commitBottomNavTabRoute({
      pathname,
      navSearch,
      href,
      tabId: tab.id,
      isActive,
      beginMenuNavigation,
      onNavigationIntent,
      guardBeforeNavigate,
      router,
    });
    e.preventDefault();
  };

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`app-desktop-side-nav__item ${isActive ? "app-desktop-side-nav__item--active" : ""}`}
      aria-current={isActive ? "page" : undefined}
      aria-label={
        tabBadgeCount > 0 ? t("nav_attention_needed", { label: tabLabel, count: tabBadgeCount }) : tabLabel
      }
    >
      <span className="app-desktop-side-nav__icon-wrap">
        <MainBottomNavTabIcon tab={tab} className="h-[22px] w-[22px]" />
        {tabBadgeCount > 0 ? <span className="app-desktop-side-nav__badge" aria-hidden /> : null}
      </span>
      <span className="app-desktop-side-nav__label">{tabLabel}</span>
    </Link>
  );
}

export function MainDesktopSideNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navSearch = searchParams.toString();
  const tabs = useMainBottomNavTabs();
  const { beginMenuNavigation } = useLatestMenuNavigation();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const [pendingActiveTabId, setPendingActiveTabId] = useState<string | null>(null);
  const displayTabs = useMemo(
    () => composeMainBottomNavDisplayTabs(pathname, tabs, searchParams),
    [pathname, tabs, searchParams]
  );

  useEffect(() => {
    syncMypageBottomNavContextFromPath(pathname, navSearch);
  }, [pathname, navSearch]);

  const onNavigationIntent = useCallback((tabId: string) => {
    setPendingActiveTabId(tabId);
  }, []);

  return (
    <nav className="app-desktop-side-nav" aria-label="Main">
      <ul className="app-desktop-side-nav__list">
        {displayTabs.map((tab) => (
          <li key={tab.id}>
            <DesktopSideNavItem
              tab={tab}
              pathname={pathname}
              navSearch={navSearch}
              pendingActiveTabId={pendingActiveTabId}
              onNavigationIntent={onNavigationIntent}
              beginMenuNavigation={beginMenuNavigation}
              guardBeforeNavigate={guardBeforeNavigate}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
