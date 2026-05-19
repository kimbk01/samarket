"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { STORE_DETAIL_MENU_TABS_ANCHORED_EVENT } from "@/lib/dibay/store-detail-menu-tabs-events";
import { useStoreDetailScrollRootScroll } from "@/lib/stores/use-store-detail-scroll-root-scroll";
import {
  getStoreDetailAppScrollRootCached,
  getStoreDetailScrollTop,
  measureStoreDetailElementScrollTop,
} from "@/lib/ui/store-detail-scroll-root";
import { readStoreDetailFixedHeaderOffsetPxCached } from "@/lib/ui/store-detail-viewport-metrics";
import {
  STORE_DETAIL_TABS_PIN_ENTER_PX,
  STORE_DETAIL_TABS_PIN_EXIT_PX,
} from "@/lib/ui/store-detail-viewport-tuning";

/**
 * 매장 메뉴 카테고리 탭 pin — 스크롤 루트 1곳 + rAF (CSS sticky 금지: 슬라이드 셸 transform).
 */
export function useStoreDetailCategoryTabsPin(args: {
  sentinelRef: RefObject<HTMLElement | null>;
  tabsRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
}): {
  pinned: boolean;
  tabsHeightPx: number;
  tabsBottomPx: () => number;
} {
  const { sentinelRef, tabsRef, enabled = true } = args;
  const [pinned, setPinned] = useState(false);
  const [tabsHeightPx, setTabsHeightPx] = useState(48);
  const pinThresholdScrollYRef = useRef(0);
  const pinnedRef = useRef(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);

  const recapturePinThreshold = useCallback(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const scrollRoot = scrollRootRef.current ?? getStoreDetailAppScrollRootCached();
    scrollRootRef.current = scrollRoot;
    const headerH = readStoreDetailFixedHeaderOffsetPxCached();
    const sentinelTop = measureStoreDetailElementScrollTop(sentinel, scrollRoot);
    pinThresholdScrollYRef.current = Math.max(0, Math.floor(sentinelTop - headerH));
  }, [sentinelRef]);

  const evaluatePin = useCallback(() => {
    if (!enabled) {
      if (pinnedRef.current) {
        pinnedRef.current = false;
        setPinned(false);
      }
      return;
    }
    const scrollRoot = scrollRootRef.current ?? getStoreDetailAppScrollRootCached();
    scrollRootRef.current = scrollRoot;
    const scrollY = getStoreDetailScrollTop(scrollRoot);
    const threshold = pinThresholdScrollYRef.current;
    const next = pinnedRef.current
      ? scrollY >= threshold - STORE_DETAIL_TABS_PIN_EXIT_PX
      : scrollY >= threshold - STORE_DETAIL_TABS_PIN_ENTER_PX;
    if (next !== pinnedRef.current) {
      pinnedRef.current = next;
      setPinned(next);
    }
  }, [enabled]);

  useLayoutEffect(() => {
    if (!enabled) {
      pinnedRef.current = false;
      setPinned(false);
      scrollRootRef.current = null;
      return;
    }
    scrollRootRef.current = getStoreDetailAppScrollRootCached();
    recapturePinThreshold();
    evaluatePin();
  }, [enabled, recapturePinThreshold, evaluatePin]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const onAnchored = () => {
      recapturePinThreshold();
      evaluatePin();
    };
    window.addEventListener(STORE_DETAIL_MENU_TABS_ANCHORED_EVENT, onAnchored);
    return () => window.removeEventListener(STORE_DETAIL_MENU_TABS_ANCHORED_EVENT, onAnchored);
  }, [enabled, recapturePinThreshold, evaluatePin]);

  useStoreDetailScrollRootScroll(evaluatePin, [enabled, evaluatePin], enabled);

  useLayoutEffect(() => {
    if (!enabled) return;
    recapturePinThreshold();
    evaluatePin();
  }, [tabsHeightPx, enabled, recapturePinThreshold, evaluatePin]);

  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const h = Math.max(48, Math.ceil(tabs.getBoundingClientRect().height));
      setTabsHeightPx((prev) => (prev === h ? prev : h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(tabs);
    return () => ro.disconnect();
  }, [tabsRef, pinned, enabled]);

  const tabsBottomPx = () => {
    const tabs = tabsRef.current;
    if (!tabs) {
      return readStoreDetailFixedHeaderOffsetPxCached() + tabsHeightPx;
    }
    return tabs.getBoundingClientRect().bottom;
  };

  return { pinned, tabsHeightPx, tabsBottomPx };
}
