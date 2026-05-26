"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { MainBottomNavTabIcon } from "@/components/main-menu/MainBottomNavTabIcon";
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
import {
  isMainBottomNavFabHrefActive,
  resolveMainBottomNavFabForPath,
} from "@/lib/main-menu/resolve-main-bottom-nav-fab";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import {
  FAB_SECTOR_TOUCH_CLASS,
  useFabSectorPressFeedback,
} from "@/lib/layout/use-fab-sector-press-feedback";
import {
  FAB_PANEL_INSET_REM,
  FAB_SURFACE_ALPHA,
  fabSectorRootStyle,
} from "@/lib/layout/main-bottom-nav-fab-sector-config";

/**
 * UI 3상태
 * - panel: 메뉴 + 하단 흰 X
 * - panel-exit: 패널 우측 슬라이드 + ‹ 동시 진입 (X 없음)
 * - edge: ‹ 탭만
 */
export { FAB_SURFACE_ALPHA } from "@/lib/layout/main-bottom-nav-fab-sector-config";

type FabUiMode = "panel" | "panel-exit" | "edge";

export function MainBottomNavFabSector() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const tabs = useMainBottomNavTabs();
  const fabConfig = useMemo(
    () => resolveMainBottomNavFabForPath(pathname, tabs),
    [pathname, tabs]
  );
  const enabled = fabConfig != null && fabConfig.items.length > 0;
  const { collapsed, collapse, expand } = useMainBottomNavFabSectorScroll(enabled);
  const { isPressed, bindPress, clearPress } = useFabSectorPressFeedback();

  const [mode, setMode] = useState<FabUiMode>("panel");
  const [panelEnter, setPanelEnter] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const startExit = useCallback(() => {
    clearPress();
    clearExitTimer();
    setMode("panel-exit");
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      setMode("edge");
    }, MAIN_BOTTOM_NAV_FAB_DOCK_MS);
  }, [clearExitTimer, clearPress]);

  useEffect(() => {
    if (!enabled) {
      clearExitTimer();
      clearPress();
      return;
    }
    if (collapsed && mode === "panel") {
      startExit();
    }
    if (!collapsed && mode === "edge") {
      setMode("panel");
    }
  }, [collapsed, enabled, mode, startExit, clearExitTimer, clearPress]);

  useEffect(() => () => clearExitTimer(), [clearExitTimer]);

  useEffect(() => {
    if (!panelEnter || mode !== "panel") return;
    const timer = setTimeout(() => setPanelEnter(false), MAIN_BOTTOM_NAV_FAB_DOCK_MS);
    return () => clearTimeout(timer);
  }, [panelEnter, mode]);

  const onClose = useCallback(() => {
    if (mode !== "panel") return;
    collapse();
  }, [mode, collapse]);

  const onEdgeOpen = useCallback(() => {
    clearPress();
    clearExitTimer();
    expand();
    setPanelEnter(true);
    setMode("panel");
  }, [clearExitTimer, expand, clearPress]);

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

  const showPanel = mode === "panel" || mode === "panel-exit";
  const showClose = mode === "panel";
  const showEdge = mode === "edge" || mode === "panel-exit";

  const panelClass = [
    "main-bottom-nav-fab-sector__panel",
    mode === "panel-exit" ? "main-bottom-nav-fab-sector__panel--exit" : "",
    panelEnter && mode === "panel" ? "main-bottom-nav-fab-sector__panel--enter" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const edgeClass = [
    "main-bottom-nav-fab-sector__edge",
    FAB_SECTOR_TOUCH_CLASS,
    MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS,
    mode === "panel-exit" ? "main-bottom-nav-fab-sector__edge--dock-in" : "",
    isPressed("edge") ? "main-bottom-nav-fab-sector__edge--pressed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BodyPortal>
      <div
        data-testid="main-bottom-nav-fab-sector"
        data-fab-mode={mode}
        data-fab-surface-alpha={FAB_SURFACE_ALPHA}
        className={`main-bottom-nav-fab-sector pointer-events-none fixed inset-x-0 ${MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS} ${MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS}`}
        style={fabRootStyle}
      >
        {showEdge ? (
          <button
            type="button"
            className={edgeClass}
            onClick={onEdgeOpen}
            disabled={mode === "panel-exit"}
            aria-label={t("store_delivery_fab_open_aria")}
            {...bindPress("edge")}
          >
            <ChevronLeftIcon />
          </button>
        ) : null}

        {showPanel ? (
          <div
            className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} pointer-events-none mx-auto flex w-full min-w-0 flex-col items-end`}
          >
            <div
              className={panelClass}
              aria-label={t("store_delivery_float_menu_aria")}
              style={{ paddingTop: `${FAB_PANEL_INSET_REM}rem` }}
            >
              <ul className="main-bottom-nav-fab-sector__list">
                {fabConfig.items.map((item) => {
                  const active = isMainBottomNavFabHrefActive(pathname, item.href);
                  const iconTab = { icon: item.icon, lucideIcon: item.lucideIcon };
                  const rowClass = [
                    "main-bottom-nav-fab-sector__row",
                    FAB_SECTOR_TOUCH_CLASS,
                    active ? "main-bottom-nav-fab-sector__row--active" : "",
                    isPressed(item.id) ? "main-bottom-nav-fab-sector__row--pressed" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  const content = (
                    <>
                      <span className="main-bottom-nav-fab-sector__icon-box">
                        <MainBottomNavTabIcon tab={iconTab} className="main-bottom-nav-fab-sector__glyph" />
                      </span>
                      <span className="main-bottom-nav-fab-sector__caption">{item.label}</span>
                    </>
                  );

                  const pressHandlers = bindPress(item.id);

                  if (item.openInNewTab) {
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={rowClass}
                          {...pressHandlers}
                          onClick={() => {
                            onClose();
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
                        aria-current={active ? "page" : undefined}
                        {...pressHandlers}
                        onPointerDown={(e) => {
                          pressHandlers.onPointerDown(e);
                          if (!active) prefetchFabHref(item.href);
                        }}
                        onClick={onClose}
                      >
                        {content}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {showClose ? (
                <div className="main-bottom-nav-fab-sector__footer">
                  <button
                    type="button"
                    className={[
                      "main-bottom-nav-fab-sector__close",
                      FAB_SECTOR_TOUCH_CLASS,
                      isPressed("close") ? "main-bottom-nav-fab-sector__close--pressed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    {...bindPress("close")}
                    onClick={onClose}
                    aria-label={t("store_delivery_fab_close_aria")}
                  >
                    <CloseIcon />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
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
