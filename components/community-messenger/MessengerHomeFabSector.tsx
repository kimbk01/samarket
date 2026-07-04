"use client";

import { useRouter } from "next/navigation";
import { Archive, User, Users, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { MessengerHomeFabPlusIcon } from "@/components/community-messenger/home/MessengerHomeFabPlusIcon";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  MAIN_BOTTOM_NAV_FAB_DOCK_MS,
  useMainBottomNavFabSectorScroll,
} from "@/lib/layout/use-main-bottom-nav-fab-sector-behavior";
import { FAB_SURFACE_ALPHA, fabPanelBodyInlineStyle } from "@/lib/layout/main-bottom-nav-fab-sector-config";
import {
  messengerFabIconBoxStyle,
  messengerFabSectorRootStyle,
  type MessengerFabItemId,
} from "@/lib/ui/messenger-fab-palette";
import {
  MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS,
  MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { useIsDesktopShellViewport } from "@/hooks/use-is-desktop-shell-viewport";
import {
  MAIN_BOTTOM_NAV_FAB_DESKTOP_SIDE_NAV_BOTTOM_CLASS,
  MAIN_BOTTOM_NAV_FAB_DESKTOP_SIDE_NAV_LEFT_CLASS,
} from "@/lib/layout/main-desktop-side-nav-layout";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import {
  FAB_SECTOR_TOUCH_CLASS,
  useFabSectorPressFeedback,
} from "@/lib/layout/use-fab-sector-press-feedback";
import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";

type FabPhase = "open" | "closing" | "closed" | "opening";

function isFabShellExpanded(phase: FabPhase, panelEnterReady: boolean): boolean {
  return phase === "open" || (phase === "opening" && panelEnterReady);
}

type FabGlyphIcon = LucideIcon | ((props: { className?: string }) => ReactNode);

const FAB_ICONS: Record<MessengerFabItemId, FabGlyphIcon> = {
  friends: User,
  open_chat: Users,
  archive: Archive,
  compose: MessengerHomeFabPlusIcon,
};

type Props = {
  mainSection: MessengerMainSection;
  onPrimarySectionChange: (next: MessengerMainSection) => void;
  onOpenComposer: () => void;
  onOpenFriendManager: () => void;
};

/**
 * 메신저 홈 FAB — 배달 `MainBottomNavFabSector` 와 동일 DOM·스크롤·morph 계약.
 * 친구·모임·보관함·새대화/친구추가 진입.
 */
export function MessengerHomeFabSector({
  mainSection,
  onPrimarySectionChange,
  onOpenComposer,
  onOpenFriendManager,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const isDesktopShell = useIsDesktopShellViewport();
  const enabled = true;
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
    if (collapsed && phase === "open") {
      startClosing();
    }
    if (!collapsed && phase === "closed" && !expandLocked) {
      startOpening();
    }
  }, [collapsed, expandLocked, phase, startClosing, startOpening]);

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

  const fabRootStyle = useMemo(
    () => messengerFabSectorRootStyle(MAIN_BOTTOM_NAV_FAB_DOCK_MS) as CSSProperties,
    []
  );

  const items = useMemo(
    () =>
      [
        {
          id: "friends" as const,
          section: "friends" as const,
          label: t("cm_ia_section_friends"),
        },
        {
          id: "archive" as const,
          section: "archive" as const,
          label: t("cm_ia_section_archive"),
        },
        {
          id: "compose" as const,
          section: null,
          label: mainSection === "friends" ? t("cm_ui_add_friend") : t("cm_ui_new_conversation"),
        },
      ] as const,
    [mainSection, t]
  );

  const shellExpanded = isFabShellExpanded(phase, panelEnterReady);
  const toggleInteractive = phase === "open" || phase === "closed";

  const toggleClass = [
    "main-bottom-nav-fab-sector__toggle",
    FAB_SECTOR_TOUCH_CLASS,
    isPressed("toggle") ? "main-bottom-nav-fab-sector__toggle--pressed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const toggleAriaLabel =
    phase === "open" ? t("store_delivery_fab_close_aria") : t("store_delivery_fab_open_aria");

  const closePanelIfOpen = () => {
    if (phase === "open") collapse();
  };

  const onSectionSelect = (section: MessengerMainSection) => {
    closePanelIfOpen();
    onPrimarySectionChange(section);
  };

  const onCompose = () => {
    closePanelIfOpen();
    if (mainSection === "friends") {
      onOpenFriendManager();
      return;
    }
    onOpenComposer();
  };

  return (
    <BodyPortal>
      <div
        data-testid="messenger-home-fab-sector"
        data-messenger-fab-sector="true"
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
                  {items.map((item) => {
                    const Icon = FAB_ICONS[item.id as MessengerFabItemId];
                    const isSection = item.section != null;
                    const active = isSection && mainSection === item.section;
                    const rowClass = [
                      "main-bottom-nav-fab-sector__row",
                      FAB_SECTOR_TOUCH_CLASS,
                      active ? "main-bottom-nav-fab-sector__row--active" : "",
                      isPressed(item.id) ? "main-bottom-nav-fab-sector__row--pressed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const pressHandlers = bindPress(item.id);

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={rowClass}
                          data-fab-item-id={`fab_messenger_${item.id}`}
                          aria-current={active ? "page" : undefined}
                          aria-label={
                            item.id === "compose"
                              ? mainSection === "friends"
                                ? t("cm_ui_add_friend")
                                : t("cm_ui_new_conversation")
                              : undefined
                          }
                          {...pressHandlers}
                          onClick={() => {
                            if (isSection && item.section) {
                              onSectionSelect(item.section);
                              return;
                            }
                            onCompose();
                          }}
                        >
                          <span
                            className="main-bottom-nav-fab-sector__icon-box relative"
                            style={messengerFabIconBoxStyle(item.id as MessengerFabItemId)}
                          >
                            <Icon className="main-bottom-nav-fab-sector__glyph" aria-hidden />
                          </span>
                          <span className="main-bottom-nav-fab-sector__caption">{item.label}</span>
                        </button>
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
