"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
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
import { mainBottomNavMessengerTabHref } from "@/lib/community-messenger/messenger-entry-origin";
import { runDeliveryDialItemNavigation } from "@/lib/delivery/delivery-dial-item-navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  clientHasVerifiedContactForInteractive,
  openPhoneVerificationRequiredDialog,
} from "@/lib/auth/phone-verification-gate-client";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { useOwnerLitePreferredStoreRow } from "@/lib/stores/use-owner-lite-store";
import { triggerMobileSelectionFeedback } from "@/lib/ui/light-tap-feedback";

const DIAL_EASE = "cubic-bezier(0.25, 0.9, 0.35, 1)";
const DIAL_NAV_ICON_CLASS = "app-bottom-nav-icon-svg";
const DIAL_SELECT_FLASH_MS = 100;

export function DeliveryDomainSwitcherOverlay({
  open,
  onClose,
  includeOpsCenter = true,
}: {
  open: boolean;
  onClose: () => void;
  /** 오너 어드민 하단 홈 다이얼 — 운영센터 칩 제외 */
  includeOpsCenter?: boolean;
}) {
  const { safeT, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const ownerStore = useOwnerLitePreferredStoreRow();
  const ownerStoreId = ownerStore?.id?.trim() ?? "";
  const { goBusinessHubOrModal, hubBlockedModal } = useStoreBusinessHubEntryModal("확인", {
    eager: false,
  });

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
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

  const closeTimerRef = useRef<number | null>(null);
  const selectTimerRef = useRef<number | null>(null);
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
  const interactionReady = entered && !rotatorAnimating && open;

  const clearTimer = useCallback((ref: { current: number | null }) => {
    if (ref.current != null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearTimer(closeTimerRef);
    clearTimer(selectTimerRef);
    clearTimer(snapTimerRef);
  }, [clearTimer]);

  const resetInteractionState = useCallback(() => {
    setPressedTabId(null);
    setSelectedTabId(null);
    selectingRef.current = false;
    dragRef.current.pointerId = null;
  }, []);

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

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  const resolveHref = useCallback((tab: BottomNavItemConfig) => {
    if (tab.id === "chat") return mainBottomNavMessengerTabHref("delivery");
    if (tab.id === "delivery-ops-center") return tab.href;
    return tab.href;
  }, []);

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
      selectingRef.current = false;
      const href = resolveHref(tab);
      if (href.includes("/community-messenger")) {
        const user = getCurrentUser();
        if (user?.id && !clientHasVerifiedContactForInteractive(user)) {
          openPhoneVerificationRequiredDialog({ next: href });
          return;
        }
      }
      runDeliveryDialItemNavigation({
        tab,
        href,
        pathname,
        onClose,
        guardBeforeNavigate,
        push: (h) => router.push(h),
        goBusinessHubOrModal,
        shouldInterceptBusinessHubHref,
      });
    },
    [guardBeforeNavigate, goBusinessHubOrModal, onClose, pathname, resolveHref, router]
  );

  const runItemSelect = useCallback(
    (tab: BottomNavItemConfig) => {
      if (!interactionReady || selectingRef.current) return;
      selectingRef.current = true;
      triggerMobileSelectionFeedback();
      setPressedTabId(null);
      setSelectedTabId(tab.id);
      clearTimer(selectTimerRef);
      selectTimerRef.current = window.setTimeout(() => {
        selectTimerRef.current = null;
        setSelectedTabId(null);
        onItemNavigate(tab);
      }, DIAL_SELECT_FLASH_MS);
    },
    [clearTimer, interactionReady, onItemNavigate]
  );

  const clearPress = useCallback(() => setPressedTabId(null), []);

  const renderDialHit = useCallback(
    (
      tab: BottomNavItemConfig,
      label: string,
      href: string,
      chip: ReactNode
    ) => {
      const hitClass = [
        "delivery-domain-switcher-hit",
        `delivery-domain-switcher-hit--${tab.id}`,
        pressedTabId === tab.id ? "delivery-domain-switcher-hit--pressed" : "",
        selectedTabId === tab.id ? "delivery-domain-switcher-hit--selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const hitPointer = {
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
          if (!interactionReady) return;
          e.stopPropagation();
          setPressedTabId(tab.id);
        },
        onPointerUp: clearPress,
        onPointerLeave: clearPress,
        onPointerCancel: clearPress,
      };

      if (tab.id === "stores") {
        return (
          <button
            type="button"
            className={hitClass}
            aria-label={label}
            {...hitPointer}
            onClick={() => runItemSelect(tab)}
          >
            {chip}
          </button>
        );
      }

      return (
        <Link
          href={href}
          prefetch={false}
          className={hitClass}
          aria-label={label}
          {...hitPointer}
          onClick={(e) => {
            e.preventDefault();
            runItemSelect(tab);
          }}
        >
          {chip}
        </Link>
      );
    },
    [clearPress, interactionReady, pressedTabId, runItemSelect, selectedTabId]
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
      const href = resolveHref(tab);
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
          {renderDialHit(tab, label, href, chip)}
        </div>
      );
    });
  }, [dialRadiusPx, entered, renderDialHit, resolveHref, safeT, slotCount, slots]);

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
          >
            <div
              className={[
                "delivery-domain-switcher-swipe-surface",
                interactionReady ? "delivery-domain-switcher-swipe-surface--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden
              onPointerDown={onSwipePointerDown}
              onPointerMove={onSwipePointerMove}
              onPointerUp={onSwipePointerUp}
              onPointerCancel={onSwipePointerUp}
            />
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
