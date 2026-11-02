"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { DibayInfoDialog } from "@/components/ui/dibay-overlay";
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
import { useOwnerBottomNavScrollHide } from "@/lib/layout/use-owner-bottom-nav-scroll-hide-behavior";
import { triggerLightTapFeedback } from "@/lib/ui/light-tap-feedback";
import {
  isOwnerBottomNavTabActive,
  type OwnerBottomNavTabId,
} from "@/lib/delivery/owner/owner-bottom-nav-active";
import {
  isOwnerHomeHubBottomNavActive,
  resolveOwnerHomeStoreHref,
  runOwnerHomeStoreNavigation,
} from "@/lib/delivery/owner/owner-home-hub-navigation";
import {
  OWNER_MOBILE_BOTTOM_NAV_HOME_LABEL_KEY,
  OWNER_MOBILE_BOTTOM_NAV_SIDE_LEFT,
  OWNER_MOBILE_BOTTOM_NAV_SIDE_RIGHT,
  type OwnerMobileBottomNavItem,
} from "@/lib/delivery/owner/owner-mobile-bottom-nav-layout";
import { OWNER_MOBILE_BOTTOM_NAV_ROOT_CLASS } from "@/lib/stores/owner-mobile-ui-tokens";
import { useOwnerHubRuntime } from "@/components/business/owner/OwnerHubRuntimeProvider";
import { buildOwnerOrdersEntryHref } from "@/lib/business/owner-orders-entry-policy";
import {
  peekOwnerHubLatestPendingOrderId,
  subscribeOwnerHubLatestPendingOrderId,
} from "@/lib/business/owner-hub-pending-order-bridge";
import {
  getOwnerFooterAboveNavActive,
  setOwnerBottomNavOccupiesClearance,
  subscribeOwnerFooterAboveNav,
} from "@/lib/business/owner-bottom-nav-occupancy";

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
  badgeCount,
  onNavigate,
}: {
  item: OwnerMobileBottomNavItem;
  href: string;
  active: boolean;
  label: string;
  /** Action-required count for this tab only (orders ≠ customers). */
  badgeCount?: number;
  onNavigate: (tabId: OwnerBottomNavTabId) => void;
}) {
  const Icon = item.icon;
  const showBadge = (badgeCount ?? 0) > 0;

  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      data-active={active ? "true" : "false"}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn("app-bottom-nav-item group", BOTTOM_NAV_ITEM_TOUCH_CLASS)}
      onPointerDown={(e) => triggerLightTapFeedback(e)}
      onClick={() => {
        if (!active) onNavigate(item.id);
      }}
    >
      <div className="app-bottom-nav-icon-slot">
        <span className="app-bottom-nav-inline-icon" key={active ? "on" : "off"}>
          <Icon className={SIDE_TAB_ICON_CLASS} aria-hidden />
          {showBadge ? (
            <span
              className={cn(
                "bottom-nav-hub-badge",
                OWNER_HUB_BADGE_DOT_CLASS,
                BOTTOM_NAV_BADGE_RING_CLASS
              )}
              data-owner-bottom-nav-badge={item.id}
            >
              {(badgeCount ?? 0) > 99 ? "99+" : badgeCount}
            </span>
          ) : null}
        </span>
      </div>
      <span className={DELIVERY_BOTTOM_NAV_LABEL_CLASS}>{label}</span>
    </Link>
  );
}

/**
 * 가운데 「홈」 — 다이얼(FAB) 없음. 누르면 「매장으로 이동합니다」 확인 후 해당 오너의 배달 매장으로 (Owner S-B 2026-11-03).
 * 선택 표시(그린 원)는 운영 홈(`/stores/owner`)일 때만.
 */
function OwnerMobileBottomNavHomeHub({
  homeLabel,
  onPress,
}: {
  homeLabel: string;
  onPress: () => void;
}) {
  const pathname = usePathname() ?? "";
  const isActive = isOwnerHomeHubBottomNavActive(pathname);

  const className = cn(
    "app-bottom-nav-item group app-bottom-nav-item--delivery-hub",
    BOTTOM_NAV_ITEM_TOUCH_CLASS
  );

  return (
    <button
      type="button"
      className={className}
      data-active={isActive ? "true" : "false"}
      aria-label={homeLabel}
      aria-current={isActive ? "page" : undefined}
      aria-haspopup="dialog"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        triggerLightTapFeedback(e);
      }}
      onClick={onPress}
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
 * 주문 · 상품 · 홈 · 고객 · 관리 — `BusinessAdminShell` 전용.
 * Geometry occupancy published for Support FAB clearance.
 *
 * Badge authority (do not mix):
 * - orders → orderAttention / orderAlertsBadge
 * - customers → storeOrderChatUnread + inquiryAttention (NOT order queue)
 */
export function OwnerMobileBottomNav({
  storeId,
  storeSlug = null,
  chatBadge,
  orderBadge,
  customersBadge,
  scrollHideEnabled = true,
}: {
  storeId: string;
  storeSlug?: string | null;
  /** @deprecated use customersBadge — kept for call-site compatibility */
  chatBadge?: number;
  orderBadge?: number;
  customersBadge?: number;
  scrollHideEnabled?: boolean;
}) {
  const { t } = useI18n();
  const hubRuntime = useOwnerHubRuntime();
  const resolvedOrderBadge =
    orderBadge ?? (hubRuntime?.orderAlertsBadge != null ? hubRuntime.orderAlertsBadge : 0);
  const resolvedCustomersBadge = customersBadge ?? chatBadge ?? 0;
  const pendingOrderId = useSyncExternalStore(
    subscribeOwnerHubLatestPendingOrderId,
    () => peekOwnerHubLatestPendingOrderId(storeId),
    () => null
  );
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  /** 탭 위에 저장·취소 바가 떠 있으면 스크롤 숨김 끔 — 바 아래 빈 띠 방지 (Owner S-A 2026-11-03) */
  const footerAboveNav = useSyncExternalStore(
    subscribeOwnerFooterAboveNav,
    getOwnerFooterAboveNavActive,
    () => false
  );
  const hiddenByScroll = useOwnerBottomNavScrollHide(scrollHideEnabled && !footerAboveNav);
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const router = useRouter();
  const [portalToBody, setPortalToBody] = useState(false);
  /** 홈 → 「매장으로 이동합니다」 확인창 · slug 없으면 이동 불가 안내 */
  const [homeDialog, setHomeDialog] = useState<"confirm" | "unavailable" | null>(null);
  const [pendingActiveId, setPendingActiveId] = useState<OwnerBottomNavTabId | null>(null);
  const lastPathKeyRef = useRef("");

  const homeStoreHref = resolveOwnerHomeStoreHref(storeSlug);
  const homeLabel = t(OWNER_MOBILE_BOTTOM_NAV_HOME_LABEL_KEY);

  useEffect(() => {
    setPortalToBody(true);
  }, []);

  /** Publish clearance while this nav is mounted (even if scroll-hidden — layout still reserved). */
  useEffect(() => {
    setOwnerBottomNavOccupiesClearance(true);
    return () => setOwnerBottomNavOccupiesClearance(false);
  }, []);

  const pathKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    if (lastPathKeyRef.current === pathKey) return;
    lastPathKeyRef.current = pathKey;
    setPendingActiveId(null);
    setHomeDialog(null);
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

  const openHomeDialog = useCallback(() => {
    setHomeDialog(homeStoreHref ? "confirm" : "unavailable");
  }, [homeStoreHref]);

  const closeHomeDialog = useCallback(() => {
    setHomeDialog(null);
  }, []);

  const confirmGoStore = useCallback(() => {
    setHomeDialog(null);
    if (!homeStoreHref) return;
    runOwnerHomeStoreNavigation({
      href: homeStoreHref,
      guardBeforeNavigate,
      push: (href) => router.push(href),
    });
  }, [guardBeforeNavigate, homeStoreHref, router]);

  const outerClass = cn(
    BOTTOM_NAV_SHELL.outerClassName,
    BOTTOM_NAV_OUTER_MOTION,
    OWNER_MOBILE_BOTTOM_NAV_ROOT_CLASS,
    resolveBottomNavScrollHideOuterClass(hiddenByScroll)
  );

  const renderSide = (items: OwnerMobileBottomNavItem[]) =>
    items.map((item) => {
      let href = item.href(storeId, storeSlug);
      if (item.id === "orders" && resolvedOrderBadge > 0) {
        href = buildOwnerOrdersEntryHref({
          storeId,
          tab: "new",
          orderId: pendingOrderId ?? undefined,
          freshList: true,
        });
      }
      const badgeCount =
        item.id === "orders"
          ? resolvedOrderBadge
          : item.id === "customers"
            ? resolvedCustomersBadge
            : 0;
      return (
        <OwnerMobileBottomNavSideTab
          key={item.id}
          item={item}
          href={href}
          label={t(item.labelKey)}
          active={isTabActive(item.id)}
          badgeCount={badgeCount}
          onNavigate={markTabIntent}
        />
      );
    });

  const ownerNavTabCount =
    OWNER_MOBILE_BOTTOM_NAV_SIDE_LEFT.length + 1 + OWNER_MOBILE_BOTTOM_NAV_SIDE_RIGHT.length;

  const nav = (
    <nav className={outerClass} data-biz="1" aria-label={t("store_ops_menu_aria")}>
      <div className={BOTTOM_NAV_SHELL.innerBarClassName}>
        <div className={BOTTOM_NAV_SHELL.containerClassName} data-tab-count={ownerNavTabCount}>
          {renderSide(OWNER_MOBILE_BOTTOM_NAV_SIDE_LEFT)}
          <OwnerMobileBottomNavHomeHub homeLabel={homeLabel} onPress={openHomeDialog} />
          {renderSide(OWNER_MOBILE_BOTTOM_NAV_SIDE_RIGHT)}
        </div>
      </div>
    </nav>
  );

  const homeDialogs = (
    <>
      <OwnerStoreAdminConfirmModal
        open={homeDialog === "confirm"}
        titleId="owner-home-go-store-title"
        title={t("popup_owner_home_go_store_title")}
        busy={false}
        onCancel={closeHomeDialog}
        onConfirm={confirmGoStore}
      />
      <DibayInfoDialog
        open={homeDialog === "unavailable"}
        title={t("popup_owner_home_store_unavailable_title")}
        confirmLabel={t("common_confirm")}
        onConfirm={closeHomeDialog}
      />
    </>
  );

  if (portalToBody && typeof document !== "undefined") {
    return (
      <>
        {createPortal(nav, document.body)}
        {homeDialogs}
      </>
    );
  }

  return (
    <>
      {nav}
      {homeDialogs}
    </>
  );
}
