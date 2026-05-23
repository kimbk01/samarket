"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryDomainSwitcherOverlay } from "@/components/delivery/navigation/DeliveryDomainSwitcherOverlay";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import {
  BOTTOM_NAV_BADGE_RING_CLASS,
  BOTTOM_NAV_OUTER_MOTION,
  BOTTOM_NAV_SHELL,
  BOTTOM_NAV_THEME,
  resolveBottomNavScrollHideOuterClass,
} from "@/lib/main-menu/bottom-nav-config";
import { DELIVERY_BOTTOM_NAV_LABEL_CLASS } from "@/lib/main-menu/delivery-bottom-nav-layout";
import { useBottomNavScrollHide } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";
import {
  isOwnerBottomNavTabActive,
  type OwnerBottomNavTabId,
} from "@/lib/stores/owner-bottom-nav-active";
import {
  isOwnerHomeHubBottomNavActive,
  runOwnerHomeHubShortTap,
} from "@/lib/stores/owner-home-hub-navigation";
import {
  OWNER_MOBILE_BOTTOM_NAV_HOME_LABEL_KEY,
  OWNER_MOBILE_BOTTOM_NAV_SIDE_LEFT,
  OWNER_MOBILE_BOTTOM_NAV_SIDE_RIGHT,
  resolveOwnerMobileBottomNavHomeHref,
  type OwnerMobileBottomNavItem,
} from "@/lib/stores/owner-mobile-bottom-nav-layout";
import { OWNER_MOBILE_BOTTOM_NAV_ROOT_CLASS } from "@/lib/stores/owner-mobile-ui-tokens";

const BOTTOM_NAV_ITEM_TOUCH_CLASS =
  "touch-manipulation select-none [-webkit-tap-highlight-color:transparent]";

const SIDE_TAB_ICON_CLASS = BOTTOM_NAV_THEME.iconSizeClass;

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function OwnerMobileBottomNavSideTab({
  item,
  href,
  active,
  label,
  chatBadge,
  onNavigate,
  onCloseDomainSwitcher,
}: {
  item: OwnerMobileBottomNavItem;
  href: string;
  active: boolean;
  label: string;
  chatBadge?: number;
  onNavigate: (tabId: OwnerBottomNavTabId) => void;
  onCloseDomainSwitcher?: () => void;
}) {
  const Icon = item.icon;
  const showChatBadge = item.id === "order-chat" && (chatBadge ?? 0) > 0;

  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      data-active={active ? "true" : "false"}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn("app-bottom-nav-item group", BOTTOM_NAV_ITEM_TOUCH_CLASS)}
      onClick={() => {
        onCloseDomainSwitcher?.();
        if (!active) onNavigate(item.id);
      }}
    >
      <div className="app-bottom-nav-icon-slot">
        <span className="app-bottom-nav-inline-icon" key={active ? "on" : "off"}>
          <Icon className={SIDE_TAB_ICON_CLASS} aria-hidden />
          {showChatBadge ? (
            <span
              className={cn(
                "bottom-nav-hub-badge",
                OWNER_HUB_BADGE_DOT_CLASS,
                BOTTOM_NAV_BADGE_RING_CLASS
              )}
            >
              {(chatBadge ?? 0) > 99 ? "99+" : chatBadge}
            </span>
          ) : null}
        </span>
      </div>
      <span className={DELIVERY_BOTTOM_NAV_LABEL_CLASS}>{label}</span>
    </Link>
  );
}

function OwnerMobileBottomNavHomeHub({
  homeHref,
  homeLabel,
  switcherOpen,
  onToggleSwitcher,
  onNavigationIntent,
  guardBeforeNavigate,
}: {
  homeHref: string;
  homeLabel: string;
  switcherOpen: boolean;
  onToggleSwitcher: () => void;
  onNavigationIntent: () => void;
  guardBeforeNavigate: (nextHref?: string) => boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  const hubPathActive = isOwnerHomeHubBottomNavActive(pathname);
  const isActive = switcherOpen || hubPathActive;

  const className = cn(
    "app-bottom-nav-item group app-bottom-nav-item--delivery-hub",
    BOTTOM_NAV_ITEM_TOUCH_CLASS
  );

  const onHubClick = useCallback(() => {
    if (hubPathActive) {
      onToggleSwitcher();
      return;
    }
    runOwnerHomeHubShortTap({
      pathname,
      href: homeHref,
      switcherOpen,
      onCloseSwitcher: () => {
        if (switcherOpen) onToggleSwitcher();
      },
      guardBeforeNavigate,
      onNavigationIntent,
      push: (href) => router.push(href),
    });
  }, [
    guardBeforeNavigate,
    homeHref,
    hubPathActive,
    onNavigationIntent,
    onToggleSwitcher,
    pathname,
    router,
    switcherOpen,
  ]);

  return (
    <button
      type="button"
      className={className}
      data-active={isActive ? "true" : "false"}
      data-switcher-open={switcherOpen ? "true" : "false"}
      aria-label={homeLabel}
      aria-expanded={switcherOpen}
      aria-haspopup="dialog"
      onClick={onHubClick}
    >
      <div className="app-bottom-nav-icon-slot app-bottom-nav-icon-slot--delivery-home">
        <span
          className={cn(
            "app-bottom-nav-delivery-home-orbit",
            isActive ? "app-bottom-nav-delivery-home-orbit--active" : ""
          )}
        >
          <Home className="app-bottom-nav-delivery-home-icon" aria-hidden />
        </span>
      </div>
      <span className={DELIVERY_BOTTOM_NAV_LABEL_CLASS}>{homeLabel}</span>
    </button>
  );
}

/**
 * 매장 오너 모바일 하단 탭 — 배달 `/stores` 와 동일 높이·아이콘/라벨 비율.
 * 주문관리 · 주문채팅 · 홈(대시보드) · 메뉴관리 · 매장설정 — `BusinessAdminShell` 전용.
 */
export function OwnerMobileBottomNav({
  storeId,
  storeSlug = null,
  chatBadge,
  scrollHideEnabled = true,
}: {
  storeId: string;
  storeSlug?: string | null;
  chatBadge?: number;
  scrollHideEnabled?: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const hiddenByScroll = useBottomNavScrollHide(scrollHideEnabled);
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const [portalToBody, setPortalToBody] = useState(false);
  const [domainSwitcherOpen, setDomainSwitcherOpen] = useState(false);
  const [pendingActiveId, setPendingActiveId] = useState<OwnerBottomNavTabId | null>(null);
  const lastPathKeyRef = useRef("");

  const homeHref = resolveOwnerMobileBottomNavHomeHref(storeId);
  const homeLabel = t(OWNER_MOBILE_BOTTOM_NAV_HOME_LABEL_KEY);

  useEffect(() => {
    setPortalToBody(true);
  }, []);

  const pathKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    if (lastPathKeyRef.current === pathKey) return;
    lastPathKeyRef.current = pathKey;
    setPendingActiveId(null);
    setDomainSwitcherOpen(false);
  }, [pathKey]);

  const markTabIntent = useCallback((tabId: OwnerBottomNavTabId) => {
    setPendingActiveId(tabId);
  }, []);

  const isTabActive = useCallback(
    (tabId: OwnerBottomNavTabId) => {
      const pathActive = isOwnerBottomNavTabActive(pathname, searchParams, tabId, storeSlug);
      if (pendingActiveId != null) return tabId === pendingActiveId;
      return pathActive;
    },
    [pathname, searchParams, pendingActiveId, storeSlug]
  );

  const closeDomainSwitcher = useCallback(() => {
    setDomainSwitcherOpen(false);
  }, []);

  const toggleDomainSwitcher = useCallback(() => {
    setDomainSwitcherOpen((open) => {
      const next = !open;
      if (next && typeof document !== "undefined") {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
      }
      return next;
    });
  }, []);

  const outerClass = cn(
    BOTTOM_NAV_SHELL.outerClassName,
    BOTTOM_NAV_OUTER_MOTION,
    OWNER_MOBILE_BOTTOM_NAV_ROOT_CLASS,
    domainSwitcherOpen ? "app-bottom-nav-shell--switcher-open" : "",
    resolveBottomNavScrollHideOuterClass(hiddenByScroll)
  );

  const renderSide = (items: OwnerMobileBottomNavItem[]) =>
    items.map((item) => {
      const href = item.href(storeId, storeSlug);
      return (
        <OwnerMobileBottomNavSideTab
          key={item.id}
          item={item}
          href={href}
          label={t(item.labelKey)}
          active={isTabActive(item.id)}
          chatBadge={item.id === "order-chat" ? chatBadge : undefined}
          onNavigate={markTabIntent}
          onCloseDomainSwitcher={domainSwitcherOpen ? closeDomainSwitcher : undefined}
        />
      );
    });

  const nav = (
    <nav className={outerClass} data-biz="1" aria-label={t("store_ops_menu_aria")}>
      <div className={`${BOTTOM_NAV_SHELL.innerBarClassName} ${BOTTOM_NAV_SHELL.heightClass}`}>
        <div className="app-bottom-nav-grid">
          {renderSide(OWNER_MOBILE_BOTTOM_NAV_SIDE_LEFT)}
          <OwnerMobileBottomNavHomeHub
            homeHref={homeHref}
            homeLabel={homeLabel}
            switcherOpen={domainSwitcherOpen}
            onToggleSwitcher={toggleDomainSwitcher}
            onNavigationIntent={() => markTabIntent("home")}
            guardBeforeNavigate={guardBeforeNavigate}
          />
          {renderSide(OWNER_MOBILE_BOTTOM_NAV_SIDE_RIGHT)}
        </div>
      </div>
    </nav>
  );

  const switcherOverlay = (
    <DeliveryDomainSwitcherOverlay
      open={domainSwitcherOpen}
      onClose={closeDomainSwitcher}
      includeOpsCenter={false}
      beginMenuNavigation={() => {}}
      onNavigationIntent={() => {}}
    />
  );

  if (portalToBody && typeof document !== "undefined") {
    return (
      <>
        {createPortal(nav, document.body)}
        {createPortal(switcherOverlay, document.body)}
      </>
    );
  }

  return (
    <>
      {nav}
      {switcherOverlay}
    </>
  );
}
