"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { useCommerceCartNavHref } from "@/components/layout/use-commerce-cart-nav-href";
import { MainBottomNavTabIcon } from "@/components/main-menu/MainBottomNavTabIcon";
import { STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME } from "@/components/stores/StoreCommerceCartStrokeIcon";
import { useMainBottomNavTabs } from "@/contexts/MainBottomNavTabsContext";
import {
  MAIN_BOTTOM_NAV_FAB_DOCK_MS,
  useMainBottomNavFabSectorScroll,
} from "@/lib/layout/use-main-bottom-nav-fab-sector-behavior";
import { openBottomNavHref } from "@/lib/main-menu/bottom-nav-link-open";
import {
  MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS,
  MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { useIsDesktopShellViewport } from "@/hooks/use-is-desktop-shell-viewport";
import {
  MAIN_BOTTOM_NAV_FAB_DESKTOP_SIDE_NAV_BOTTOM_CLASS,
  MAIN_BOTTOM_NAV_FAB_DESKTOP_SIDE_NAV_LEFT_CLASS,
} from "@/lib/layout/main-desktop-side-nav-layout";
import {
  isMainBottomNavFabHrefActive,
  resolveMainBottomNavFabForPath,
} from "@/lib/main-menu/resolve-main-bottom-nav-fab";
import { COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART } from "@/lib/stores/store-commerce-cart-nav";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import {
  FAB_SECTOR_TOUCH_CLASS,
  useFabSectorPressFeedback,
} from "@/lib/layout/use-fab-sector-press-feedback";
import {
  FAB_SURFACE_ALPHA,
  fabPanelBodyInlineStyle,
  fabSectorRootStyle,
} from "@/lib/layout/main-bottom-nav-fab-sector-config";
import { deliveryFabIconBoxStyle } from "@/lib/ui/delivery-fab-christmas-starbucks-palette";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { useApprovedOwnerStoreForFab } from "@/lib/stores/use-approved-owner-store-for-fab";
import {
  ensureStoreAdminFabItemForApprovedOwner,
  isMainBottomNavFabStoreAdminItem,
} from "@/lib/main-menu/main-bottom-nav-fab-store-admin";
import { localizeMainBottomNavFabDisplayItems } from "@/lib/main-menu/main-bottom-nav-fab-i18n";
import { prefetchOwnerLiteStoreQuiet } from "@/lib/stores/owner-lite-external-store";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { resolveOwnerOperationsCenterAttentionCount } from "@/lib/stores/owner-store-badge-display-policy";

/**
 * CONTRACT — 배달 하단 FAB (`docs/main-bottom-nav-fab-sector-contract.md`)
 * DO NOT: __edge/__stack 분리 · CSS panel/shell padding-top · toggle 높이 이중 규칙
 * MUST: 단일 __shell morph · fabPanelBodyInlineStyle() · X→expandLocked+refresh
 */
export { FAB_SURFACE_ALPHA } from "@/lib/layout/main-bottom-nav-fab-sector-config";

type FabPhase = "open" | "closing" | "closed" | "opening";

const FAB_PANEL_COUNT_BADGE_CLASS = `main-bottom-nav-fab-sector__panel-badge ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME} ring-white`;
const FAB_TOGGLE_CART_COUNT_BADGE_CLASS = `main-bottom-nav-fab-sector__toggle-cart-badge ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`;

function formatFabCartCountBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function isFabCartItem(item: { id: string; icon: string }): boolean {
  return item.icon === "cart" || item.id === "fab_delivery_cart";
}

function isFabShellExpanded(phase: FabPhase, panelEnterReady: boolean): boolean {
  return phase === "open" || (phase === "opening" && panelEnterReady);
}

export function MainBottomNavFabSector() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const isDesktopShell = useIsDesktopShellViewport();
  const tabs = useMainBottomNavTabs();
  const fabConfigResolved = useMemo(
    () => resolveMainBottomNavFabForPath(pathname, tabs),
    [pathname, tabs]
  );
  const approvedOwnerStore = useApprovedOwnerStoreForFab();
  const ownerHubBreakdown = useOwnerHubBadgeBreakdown();
  const { openBlockedModalIfNeeded, hubBlockedModal } = useStoreBusinessHubEntryModal(t("common_confirm"));
  const fabConfig = useMemo(() => {
    if (!fabConfigResolved) return null;
    const items = localizeMainBottomNavFabDisplayItems(
      ensureStoreAdminFabItemForApprovedOwner(fabConfigResolved.items, approvedOwnerStore),
      t
    );
    if (items.length === 0) return null;
    return { ...fabConfigResolved, items };
  }, [fabConfigResolved, approvedOwnerStore, t]);

  useEffect(() => {
    if (!fabConfigResolved) return;
    prefetchOwnerLiteStoreQuiet();
  }, [fabConfigResolved, approvedOwnerStore?.id]);
  const ownerOpsAttention = approvedOwnerStore
    ? resolveOwnerOperationsCenterAttentionCount(ownerHubBreakdown)
    : 0;
  const { cartCount } = useCommerceCartNavHref(COMMERCE_CART_NAV_FALLBACK_AGGREGATE_CART);
  const enabled = fabConfig != null && fabConfig.items.length > 0;
  const [expandLocked, setExpandLocked] = useState(false);
  const { collapsed, collapse, expand } = useMainBottomNavFabSectorScroll(enabled, expandLocked);
  const { isPressed, bindPress, clearPress } = useFabSectorPressFeedback();

  const [phase, setPhase] = useState<FabPhase>("open");
  const [panelEnterReady, setPanelEnterReady] = useState(false);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelEnterRafRef = useRef<number | null>(null);

  const clearPhaseTimer = useCallback(() => {
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
  }, []);

  const clearPanelEnterRaf = useCallback(() => {
    if (panelEnterRafRef.current != null) {
      window.cancelAnimationFrame(panelEnterRafRef.current);
      panelEnterRafRef.current = null;
    }
  }, []);

  const startClosing = useCallback(() => {
    clearPress();
    clearPhaseTimer();
    clearPanelEnterRaf();
    setPanelEnterReady(false);
    setPhase("closing");
    phaseTimerRef.current = setTimeout(() => {
      phaseTimerRef.current = null;
      setPhase("closed");
    }, MAIN_BOTTOM_NAV_FAB_DOCK_MS);
  }, [clearPhaseTimer, clearPanelEnterRaf, clearPress]);

  const startOpening = useCallback(() => {
    clearPress();
    clearPhaseTimer();
    clearPanelEnterRaf();
    setPanelEnterReady(false);
    setPhase("opening");
    panelEnterRafRef.current = window.requestAnimationFrame(() => {
      panelEnterRafRef.current = window.requestAnimationFrame(() => {
        panelEnterRafRef.current = null;
        setPanelEnterReady(true);
      });
    });
    phaseTimerRef.current = setTimeout(() => {
      phaseTimerRef.current = null;
      setPanelEnterReady(false);
      setPhase("open");
    }, MAIN_BOTTOM_NAV_FAB_DOCK_MS);
  }, [clearPhaseTimer, clearPanelEnterRaf, clearPress]);

  useEffect(() => {
    if (!enabled) {
      clearPhaseTimer();
      clearPanelEnterRaf();
      clearPress();
      setPanelEnterReady(false);
      setExpandLocked(false);
      setPhase("open");
      return;
    }
    if (collapsed && phase === "open") {
      startClosing();
    }
    if (!collapsed && phase === "closed" && !expandLocked) {
      startOpening();
    }
  }, [
    collapsed,
    enabled,
    expandLocked,
    phase,
    startClosing,
    startOpening,
    clearPhaseTimer,
    clearPanelEnterRaf,
    clearPress,
  ]);

  useEffect(
    () => () => {
      clearPhaseTimer();
      clearPanelEnterRaf();
    },
    [clearPhaseTimer, clearPanelEnterRaf]
  );

  const onToggle = useCallback(() => {
    if (phase === "open") {
      setExpandLocked(true);
      collapse();
      router.refresh();
      return;
    }
    if (phase === "closed") {
      setExpandLocked(false);
      expand();
    }
  }, [phase, collapse, expand, router]);

  const prefetchFabHref = useCallback(
    (href: string) => {
      try {
        void router.prefetch(href);
      } catch {
        /* noop */
      }
    },
    [router]
  );

  const fabRootStyle = useMemo(
    () => fabSectorRootStyle(MAIN_BOTTOM_NAV_FAB_DOCK_MS) as CSSProperties,
    []
  );

  if (!enabled || !fabConfig) return null;

  const shellExpanded = isFabShellExpanded(phase, panelEnterReady);
  const toggleInteractive = phase === "open" || phase === "closed";
  const showToggleCartBadge = cartCount > 0 && !shellExpanded;

  const toggleClass = [
    "main-bottom-nav-fab-sector__toggle",
    FAB_SECTOR_TOUCH_CLASS,
    isPressed("toggle") ? "main-bottom-nav-fab-sector__toggle--pressed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const toggleAriaLabel =
    phase === "open"
      ? t("store_delivery_fab_close_aria")
      : cartCount > 0
        ? t("nav_cart_aria")
        : t("store_delivery_fab_open_aria");

  return (
    <BodyPortal>
      {hubBlockedModal}
      <div
        data-testid="main-bottom-nav-fab-sector"
        data-fab-phase={phase}
        data-fab-shell-expanded={shellExpanded ? "true" : "false"}
        data-panel-enter-ready={panelEnterReady ? "true" : "false"}
        data-fab-surface-alpha={FAB_SURFACE_ALPHA}
        className={`main-bottom-nav-fab-sector pointer-events-none fixed ${
          isDesktopShell ? "inset-x-auto right-0" : "inset-x-0"
        } ${MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS} ${
          isDesktopShell ? MAIN_BOTTOM_NAV_FAB_DESKTOP_SIDE_NAV_BOTTOM_CLASS : MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS
        } ${isDesktopShell ? MAIN_BOTTOM_NAV_FAB_DESKTOP_SIDE_NAV_LEFT_CLASS : ""}`}
        style={fabRootStyle}
      >
        <div
          className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} pointer-events-none mx-auto flex w-full min-w-0 justify-end`}
        >
          <div className="main-bottom-nav-fab-sector__dock">
            <div
              className="main-bottom-nav-fab-sector__shell"
              aria-label={shellExpanded ? t("store_delivery_float_menu_aria") : undefined}
            >
              <div
                className="main-bottom-nav-fab-sector__panel-body"
                style={fabPanelBodyInlineStyle()}
              >
                <ul className="main-bottom-nav-fab-sector__list">
                  {fabConfig.items.map((item) => {
                    const active = isMainBottomNavFabHrefActive(pathname, item.href);
                    const cartItem = isFabCartItem(item);
                    const storeAdminItem = isMainBottomNavFabStoreAdminItem(item);
                    const showCartBadge = cartItem && cartCount > 0;
                    const showOpsBadge = storeAdminItem && ownerOpsAttention > 0;
                    const hubIntercept = storeAdminItem && shouldInterceptBusinessHubHref(item.href);
                    const iconTab = { icon: item.icon, lucideIcon: item.lucideIcon };
                    const rowClass = [
                      "main-bottom-nav-fab-sector__row",
                      FAB_SECTOR_TOUCH_CLASS,
                      storeAdminItem ? "main-bottom-nav-fab-sector__row--store-admin" : "",
                      active ? "main-bottom-nav-fab-sector__row--active" : "",
                      isPressed(item.id) ? "main-bottom-nav-fab-sector__row--pressed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    const content = (
                      <>
                        <span
                          className="main-bottom-nav-fab-sector__icon-box relative"
                          style={deliveryFabIconBoxStyle(item.id)}
                        >
                          <MainBottomNavTabIcon tab={iconTab} className="main-bottom-nav-fab-sector__glyph" />
                          {showCartBadge ? (
                            <span className={FAB_PANEL_COUNT_BADGE_CLASS} aria-hidden>
                              {formatFabCartCountBadge(cartCount)}
                            </span>
                          ) : null}
                          {showOpsBadge ? (
                            <span className={FAB_PANEL_COUNT_BADGE_CLASS} aria-hidden>
                              {formatFabCartCountBadge(ownerOpsAttention)}
                            </span>
                          ) : null}
                        </span>
                        <span className="main-bottom-nav-fab-sector__caption">{item.label}</span>
                      </>
                    );

                    const pressHandlers = bindPress(item.id);

                    const closePanel = () => {
                      if (phase === "open") collapse();
                    };

                    if (item.openInNewTab) {
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={rowClass}
                            data-fab-item-id={item.id}
                            {...pressHandlers}
                            onClick={() => {
                              closePanel();
                              if (hubIntercept && openBlockedModalIfNeeded()) return;
                              openBottomNavHref(item.href, true);
                            }}
                          >
                            {content}
                          </button>
                        </li>
                      );
                    }

                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          prefetch={false}
                          className={rowClass}
                          data-fab-item-id={item.id}
                          aria-current={active ? "page" : undefined}
                          aria-label={
                            showCartBadge
                              ? t("nav_cart_aria")
                              : storeAdminItem
                                ? t("store_delivery_fab_store")
                                : undefined
                          }
                          {...pressHandlers}
                          onPointerDown={(e) => {
                            pressHandlers.onPointerDown(e);
                            if (!active) prefetchFabHref(item.href);
                          }}
                          onClick={(e) => {
                            if (hubIntercept && openBlockedModalIfNeeded()) {
                              e.preventDefault();
                              return;
                            }
                            closePanel();
                          }}
                        >
                          {content}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <button
                type="button"
                className={toggleClass}
                onClick={onToggle}
                disabled={!toggleInteractive}
                aria-label={toggleAriaLabel}
                {...bindPress("toggle")}
              >
                <span className="main-bottom-nav-fab-sector__toggle-icon main-bottom-nav-fab-sector__toggle-icon--open">
                  <CloseIcon />
                </span>
                <span className="main-bottom-nav-fab-sector__toggle-icon main-bottom-nav-fab-sector__toggle-icon--closed">
                  <ChevronLeftIcon />
                </span>
              </button>
            </div>
            {showToggleCartBadge ? (
              <span className={FAB_TOGGLE_CART_COUNT_BADGE_CLASS} aria-hidden>
                {formatFabCartCountBadge(cartCount)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden width={16} height={16}>
      <path
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.25}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden width={14} height={14}>
      <path
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d="M15 18l-6-6 6-6"
      />
    </svg>
  );
}
