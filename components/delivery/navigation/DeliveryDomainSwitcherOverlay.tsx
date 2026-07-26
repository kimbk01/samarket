"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { composeDeliveryDomainSwitcherSlots } from "@/lib/delivery/delivery-domain-switcher-slots";
import {
  DELIVERY_DIAL_ANIM_MS,
  DELIVERY_DIAL_SWIPE_DEG_PER_PX,
  deliveryDialAnimTotalMs,
  deliveryDialCloseStaggerDelayMs,
  deliveryDialItemAngleDeg,
  deliveryDialOpenStaggerDelayMs,
  deliveryDialRadiusPxBounded,
  deliveryDialSweepStartDeg,
  snapDeliveryDialRotationDeg,
} from "@/lib/delivery/delivery-domain-switcher-arc";
import { resolveDeliveryDialIconComponent } from "@/lib/delivery/delivery-domain-switcher-icons";
import { resolveDeliveryDomainDialItemHref, type HomeHubDomainDialContext } from "@/lib/delivery/resolve-delivery-domain-dial-item-href";
import { runDeliveryDialItemNavigation } from "@/lib/delivery/delivery-dial-item-navigation";
import {
  DELIVERY_DIAL_CHIP_HIT_CLASS,
  DELIVERY_DIAL_CHIP_HIT_CURRENT_MODIFIER,
  DELIVERY_DIAL_CHIP_HIT_SELECTOR,
  isDeliveryDialChipInteractionReady,
} from "@/lib/delivery/delivery-dial-chip-contract";
import { resolveHomeHubDialEmphasizedTabId } from "@/lib/delivery/delivery-domain-dial-emphasis";
import { prewarmDeliveryDomainDialTargets } from "@/lib/delivery/prewarm-delivery-domain-dial";
import { useRegionOptional } from "@/contexts/RegionContext";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { useOwnerNavigationSummary } from "@/lib/delivery/owner/projections/use-owner-navigation-summary";
import { triggerMobileSelectionFeedback } from "@/lib/ui/light-tap-feedback";
import { markBottomNavRouteIntentForBackgroundWarm } from "@/lib/navigation/mark-bottom-nav-route-intent";
import { navPerfMarkBottomNavClickStart } from "@/lib/navigation/nav-perf-browser";

const DIAL_EASE = "cubic-bezier(0.25, 0.9, 0.35, 1)";
const DIAL_NAV_ICON_CLASS = "app-bottom-nav-icon-svg";
export function DeliveryDomainSwitcherOverlay({
  open,
  onClose,
  includeOpsCenter = true,
  dialContext = "delivery",
  beginMenuNavigation,
  onNavigationIntent,
}: {
  open: boolean;
  onClose: () => void;
  /** 오너 어드민 하단 홈 다이얼 — 운영센터 칩 제외 */
  includeOpsCenter?: boolean;
  /** 거래 레일 홈 다이얼 — 메신저 칩 `from=trade` */
  dialContext?: HomeHubDomainDialContext;
  beginMenuNavigation: (href: string) => void;
  onNavigationIntent: (tabId: string) => void;
}) {
  const { safeT, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navSearch = searchParams.toString();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const ownerNav = useOwnerNavigationSummary();
  const ownerStoreId = ownerNav.storeId?.trim() ?? "";
  const { goBusinessHubOrModal, hubBlockedModal } = useStoreBusinessHubEntryModal("확인", {
    eager: false,
  });
  const regionCtx = useRegionOptional();
  const primaryRegion = regionCtx?.primaryRegion ?? null;

  const slots = useMemo(
    () => composeDeliveryDomainSwitcherSlots(ownerStoreId, { includeOpsCenter }),
    [ownerStoreId, includeOpsCenter]
  );
  const slotCount = slots.length;
  const sweepStartDeg = deliveryDialSweepStartDeg(slotCount);
  const animTotalMs = deliveryDialAnimTotalMs(slotCount);

  const [viewportWidthPx, setViewportWidthPx] = useState(390);
  const dialRadiusPx = useMemo(
    () => deliveryDialRadiusPxBounded(viewportWidthPx, slotCount),
    [viewportWidthPx, slotCount]
  );

  useLayoutEffect(() => {
    const sync = () => setViewportWidthPx(window.innerWidth);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [rotatorDeg, setRotatorDeg] = useState(0);
  const [rotatorAnimating, setRotatorAnimating] = useState(false);
  const [pressedTabId, setPressedTabId] = useState<string | null>(null);
  const lastChipSelectRef = useRef<{ tabId: string; at: number } | null>(null);

  const closeTimerRef = useRef<number | null>(null);
  const snapTimerRef = useRef<number | null>(null);
  const prevOpenRef = useRef(false);
  const rotatorDegRef = useRef(0);
  const selectingRef = useRef(false);
  const dragRef = useRef<{ pointerId: number | null; startX: number; startRot: number }>({
    pointerId: null,
    startX: 0,
    startRot: 0,
  });

  rotatorDegRef.current = rotatorDeg;
  /** 칩 탭 — CSS `--open`(entered)과 동기. 열림 애니 전에는 pointer-events:none */
  const interactionReady = isDeliveryDialChipInteractionReady(open, portalReady, entered);

  const clearTimer = useCallback((ref: { current: number | null }) => {
    if (ref.current != null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearTimer(closeTimerRef);
    clearTimer(snapTimerRef);
  }, [clearTimer]);

  const resetInteractionState = useCallback(() => {
    setPressedTabId(null);
    lastChipSelectRef.current = null;
    selectingRef.current = false;
    dragRef.current.pointerId = null;
  }, []);

  useLayoutEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    clearAllTimers();
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (open) {
      setMounted(true);
      setEntered(false);
      resetInteractionState();
      setRotatorAnimating(false);
      setRotatorDeg(0);
      rotatorDegRef.current = 0;

      let rafB = 0;
      const rafA = requestAnimationFrame(() => {
        rafB = requestAnimationFrame(() => setEntered(true));
      });

      return () => {
        cancelAnimationFrame(rafA);
        if (rafB) cancelAnimationFrame(rafB);
        clearAllTimers();
      };
    }

    if (!wasOpen) return undefined;

    resetInteractionState();
    setEntered(false);
    setRotatorAnimating(true);
    setRotatorDeg(sweepStartDeg);
    rotatorDegRef.current = sweepStartDeg;

    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setMounted(false);
      setRotatorAnimating(false);
      setRotatorDeg(0);
      rotatorDegRef.current = 0;
    }, animTotalMs);

    return () => clearAllTimers();
  }, [open, clearAllTimers, resetInteractionState, sweepStartDeg, animTotalMs]);

  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  useLayoutEffect(() => {
    if (!open) return;
    prewarmDeliveryDomainDialTargets(slots, {
      primaryRegion,
      dialContext,
      prefetch: (href) => {
        try {
          router.prefetch(href);
        } catch {
          /* noop */
        }
      },
    });
  }, [open, slots, primaryRegion, router, dialContext]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  const resolveHref = useCallback(
    (tab: BottomNavItemConfig) => resolveDeliveryDomainDialItemHref(tab, dialContext),
    [dialContext]
  );

  const finishSwipe = useCallback(
    (nextRot: number) => {
      const snapped = snapDeliveryDialRotationDeg(nextRot, slotCount);
      setRotatorAnimating(true);
      setRotatorDeg(snapped);
      rotatorDegRef.current = snapped;
      clearTimer(snapTimerRef);
      snapTimerRef.current = window.setTimeout(() => {
        snapTimerRef.current = null;
        setRotatorAnimating(false);
      }, DELIVERY_DIAL_ANIM_MS);
    },
    [clearTimer, slotCount]
  );

  const onSwipePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!interactionReady || selectingRef.current) return;
      const target = e.target;
      if (target instanceof Element && target.closest(DELIVERY_DIAL_CHIP_HIT_SELECTOR)) return;
      dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startRot: rotatorDegRef.current };
      setRotatorAnimating(false);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [interactionReady]
  );

  const onSwipePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d.pointerId !== e.pointerId) return;
    const next = d.startRot + (e.clientX - d.startX) * DELIVERY_DIAL_SWIPE_DEG_PER_PX;
    setRotatorDeg(next);
    rotatorDegRef.current = next;
  }, []);

  const onSwipePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (d.pointerId !== e.pointerId) return;
      dragRef.current.pointerId = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      finishSwipe(rotatorDegRef.current);
    },
    [finishSwipe]
  );

  const onItemNavigate = useCallback(
    (tab: BottomNavItemConfig) => {
      const href = resolveHref(tab);
      if (href.includes("/community-messenger")) {
        void requireAuthAction(
          "messenger_open",
          () => {
            const navClickT0 = performance.now();
            markBottomNavRouteIntentForBackgroundWarm();
            navPerfMarkBottomNavClickStart(navClickT0);
            runDeliveryDialItemNavigation({
              tab,
              pathname,
              currentSearch: navSearch,
              onClose,
              guardBeforeNavigate,
              beginMenuNavigation,
              onNavigationIntent,
              push: (h) => router.push(h),
              replace: (h) => router.replace(h),
              goBusinessHubOrModal,
              shouldInterceptBusinessHubHref,
              prefetch: (h) => {
                try {
                  router.prefetch(h);
                } catch {
                  /* ignore */
                }
              },
            });
          },
          { next: href },
        );
        return;
      }
      const navClickT0 = performance.now();
      markBottomNavRouteIntentForBackgroundWarm();
      navPerfMarkBottomNavClickStart(navClickT0);
      runDeliveryDialItemNavigation({
        tab,
        pathname,
        currentSearch: navSearch,
        onClose,
        guardBeforeNavigate,
        beginMenuNavigation,
        onNavigationIntent,
        push: (h) => router.push(h),
        replace: (h) => router.replace(h),
        goBusinessHubOrModal,
        shouldInterceptBusinessHubHref,
        prefetch: (h) => {
          try {
            router.prefetch(h);
          } catch {
            /* noop */
          }
        },
        dialContext,
      });
    },
    [
      beginMenuNavigation,
      guardBeforeNavigate,
      goBusinessHubOrModal,
      onClose,
      onNavigationIntent,
      pathname,
      resolveHref,
      router,
      navSearch,
      dialContext,
    ]
  );

  const runItemSelect = useCallback(
    (tab: BottomNavItemConfig) => {
      if (!interactionReady || selectingRef.current) return;
      const now = performance.now();
      const prev = lastChipSelectRef.current;
      if (prev && prev.tabId === tab.id && now - prev.at < 80) return;
      lastChipSelectRef.current = { tabId: tab.id, at: now };

      selectingRef.current = true;
      try {
        triggerMobileSelectionFeedback();
        setPressedTabId(null);
        onItemNavigate(tab);
      } finally {
        selectingRef.current = false;
      }
    },
    [interactionReady, onItemNavigate]
  );

  const emphasizedTabId = useMemo(
    () => resolveHomeHubDialEmphasizedTabId(dialContext),
    [dialContext]
  );

  const renderDialHit = useCallback(
    (
      tab: BottomNavItemConfig,
      label: string,
      chip: ReactNode
    ) => {
      const hitClass = [
        DELIVERY_DIAL_CHIP_HIT_CLASS,
        `${DELIVERY_DIAL_CHIP_HIT_CLASS}--${tab.id}`,
        tab.id === emphasizedTabId ? DELIVERY_DIAL_CHIP_HIT_CURRENT_MODIFIER : "",
        pressedTabId === tab.id ? `${DELIVERY_DIAL_CHIP_HIT_CLASS}--pressed` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const activateChip = () => runItemSelect(tab);
      const hitPointer = {
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
          if (!interactionReady) return;
          e.stopPropagation();
          setPressedTabId(tab.id);
        },
        onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
          e.stopPropagation();
          setPressedTabId(null);
        },
        onPointerCancel: () => setPressedTabId(null),
        onPointerLeave: () => setPressedTabId(null),
      };
      const keyActivate = (e: ReactKeyboardEvent<HTMLElement>) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        activateChip();
      };

      return (
        <button
          type="button"
          className={hitClass}
          aria-label={label}
          {...hitPointer}
          onKeyDown={keyActivate}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!interactionReady) return;
            activateChip();
          }}
        >
          {chip}
        </button>
      );
    },
    [emphasizedTabId, interactionReady, pressedTabId, runItemSelect]
  );

  const dialNodes = useMemo(() => {
    return slots.map((slot, index) => {
      const angleDeg = deliveryDialItemAngleDeg(index, slotCount);
      const itemStyle = {
        "--dial-angle": `${angleDeg}deg`,
        "--dial-radius": `${dialRadiusPx}px`,
        transitionDelay: entered
          ? `${deliveryDialOpenStaggerDelayMs(index)}ms`
          : `${deliveryDialCloseStaggerDelayMs(index, slotCount)}ms`,
      } as CSSProperties;

      if (slot.kind === "placeholder") {
        return (
          <div
            key={slot.slotId}
            className={`delivery-domain-switcher-item delivery-domain-switcher-item--reserved ${entered ? "delivery-domain-switcher-item--open" : "delivery-domain-switcher-item--closed"}`}
            style={itemStyle}
            aria-hidden
          >
            <div className="delivery-domain-switcher-chip-disk delivery-domain-switcher-chip-disk--reserved" />
          </div>
        );
      }

      const { tab, dialIcon } = slot;
      const label = tab.labelKey ? safeT(tab.labelKey) : tab.label;
      const Icon = resolveDeliveryDialIconComponent(dialIcon);
      const chip = (
        <>
          <span className="delivery-domain-switcher-chip-disk">
            <Icon className={DIAL_NAV_ICON_CLASS} aria-hidden />
          </span>
          <span className="delivery-domain-switcher-chip-label">{label}</span>
        </>
      );

      return (
        <div
          key={tab.id}
          className={`delivery-domain-switcher-item ${entered ? "delivery-domain-switcher-item--open" : "delivery-domain-switcher-item--closed"}`}
          style={itemStyle}
        >
          {renderDialHit(tab, label, chip)}
        </div>
      );
    });
  }, [dialRadiusPx, entered, renderDialHit, safeT, slotCount, slots]);

  const anchorStyle = {
    "--dial-radius": `${dialRadiusPx}px`,
  } as CSSProperties;

  if (!mounted || !portalReady || typeof document === "undefined") return null;

  const stageTree = (
    <div className="delivery-domain-switcher-stage-layer" role="presentation">
      <div className="delivery-domain-switcher-stage">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("nav_delivery_domain_switcher_aria")}
          className="delivery-domain-switcher-anchor"
          style={anchorStyle}
        >
          <div
            className={[
              "delivery-domain-switcher-rotator",
              rotatorAnimating ? "delivery-domain-switcher-rotator--animating" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              transform: `translateX(-50%) rotate(${rotatorDeg}deg)`,
              transition: rotatorAnimating ? `transform ${DELIVERY_DIAL_ANIM_MS}ms ${DIAL_EASE}` : undefined,
            }}
            onPointerDown={onSwipePointerDown}
            onPointerMove={onSwipePointerMove}
            onPointerUp={onSwipePointerUp}
            onPointerCancel={onSwipePointerUp}
          >
            <div className="delivery-domain-switcher-swipe-surface" aria-hidden />
            {dialNodes}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {hubBlockedModal}
      {createPortal(
        <div className="delivery-domain-switcher-backdrop-layer" role="presentation">
          <button
            type="button"
            className={[
              "delivery-domain-switcher-backdrop",
              entered ? "delivery-domain-switcher-backdrop--visible" : "delivery-domain-switcher-backdrop--hidden",
            ].join(" ")}
            aria-label={t("nav_menu_close")}
            tabIndex={entered ? 0 : -1}
            onClick={onClose}
          />
        </div>,
        document.body
      )}
      {createPortal(stageTree, document.body)}
    </>
  );
}
