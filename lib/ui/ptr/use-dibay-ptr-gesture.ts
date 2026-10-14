"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  getMainAppScrollRootCached,
  getMainAppScrollTop,
  invalidateMainAppScrollRootCache,
} from "@/lib/layout/main-app-scroll-root";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import type { DibayPtrSnapshot } from "@/lib/ui/ptr/create-dibay-ptr-store";
import {
  computeDibayPtrPullPxFromTouchDy,
  DIBAY_PTR_CLICK_SUPPRESS_RATIO,
  DIBAY_PTR_CLICK_SUPPRESS_WINDOW_MS,
  DIBAY_PTR_THRESHOLD_PX,
  isDibayPtrVerticalPullDown,
} from "@/lib/ui/ptr/dibay-ptr-ssot";

export type DibayPtrGestureStore = {
  getSnapshot: () => DibayPtrSnapshot;
  patch: (p: { pullPx?: number; refreshing?: boolean }) => void;
};

export type UseDibayPtrGestureOptions = {
  enabled: boolean;
  store: DibayPtrGestureStore;
  /** 임계 이상에서 손을 뗐을 때 — 도메인 run 호출 */
  onRelease: (pulledPx: number) => void;
  /** 스크롤 루트 `data-*` 표식 (camelCase dataset 키) */
  rootDatasetKey: string;
  /** 배달 허브 — sticky header(본문 스크롤 밖)에서 시작한 당김도 받음 */
  bindStickyHeader?: boolean;
  /** 언마운트 시 REFRESHING 이면 강제 리셋 (거래·커뮤니티·메신저 기존 동작) */
  resetRefreshingOnCleanup?: boolean;
  /**
   * 스크롤 루트 외에 실제로 스크롤되는 자식 컨테이너 (예: 메신저 `[data-messenger-hub-list-scroll]`).
   * 모두 scrollTop ≤ 0 일 때만 최상단으로 판정한다.
   */
  extraScrollContainerSelector?: string;
  /** effect 재바인딩 키 (거래: pathname·query) */
  rebindKey?: string;
};

function isPullRefreshExcludedTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return !!target.closest("input, textarea, select");
}

function queryExtraScrollContainers(selector: string | undefined): HTMLElement[] {
  if (!selector || typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll(selector)).filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  );
}

export function isDibayPtrScrollAtTop(extraScrollContainerSelector?: string): boolean {
  if (getMainAppScrollTop(getMainAppScrollRootCached()) > 0) return false;
  for (const el of queryExtraScrollContainers(extraScrollContainerSelector)) {
    if (el.scrollTop > 0) return false;
  }
  return true;
}

/**
 * CONTRACT — 메인 허브 PTR 제스처 단일 구현.
 * - scrollTop=0(스크롤 루트 + 지정 자식 컨테이너) 에서만 시작, 세로 판정 후에만 `preventDefault`.
 * - 리스너: 스크롤 루트(capture, touchmove passive:false) [+ sticky header].
 * - input/textarea/select 시작 제외, 임계 25% 초과 당김 직후 a/button/tab 클릭 1회 억제.
 * DO NOT: 스크롤 본문 transform · window 전역 리스너.
 */
export function useDibayPtrGesture(options: UseDibayPtrGestureOptions): void {
  const {
    enabled,
    store,
    rootDatasetKey,
    bindStickyHeader = false,
    resetRefreshingOnCleanup = false,
    extraScrollContainerSelector,
    rebindKey,
  } = options;
  const onReleaseRef = useRef(options.onRelease);
  useLayoutEffect(() => {
    onReleaseRef.current = options.onRelease;
  });
  const pullRef = useRef(0);
  const trackingRef = useRef(false);
  const pullingRef = useRef(false);
  /** 당김 제스처가 만든 click 억제 기한(performance.now) — 0 이면 비활성 */
  const suppressClickUntilRef = useRef(0);
  const pulledPastSuppressRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    invalidateMainAppScrollRootCache();
    const isScrollAtTop = () => isDibayPtrScrollAtTop(extraScrollContainerSelector);

    const resetPull = () => {
      pullingRef.current = false;
      trackingRef.current = false;
      if (pullRef.current === 0 && store.getSnapshot().pullPx === 0) return;
      pullRef.current = 0;
      store.patch({ pullPx: 0 });
    };

    const onTouchStart = (e: TouchEvent) => {
      /*
       * 새 터치 = 새 제스처 — 이전 당김의 click 억제를 해제.
       * (터치 드래그는 보통 click 을 만들지 않아, 억제 플래그가 남으면 다음 정상 탭을 삼켰다)
       */
      suppressClickUntilRef.current = 0;
      pulledPastSuppressRef.current = false;
      if (store.getSnapshot().refreshing) return;
      if (!isScrollAtTop()) return;
      if (isPullRefreshExcludedTarget(e.target)) return;

      trackingRef.current = true;
      pullingRef.current = false;
      startYRef.current = e.touches[0]?.clientY ?? 0;
      startXRef.current = e.touches[0]?.clientX ?? 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current) return;
      if (!isScrollAtTop()) {
        resetPull();
        return;
      }

      const y = e.touches[0]?.clientY;
      const x = e.touches[0]?.clientX;
      if (y == null || x == null) return;

      const dy = y - startYRef.current;
      const dx = x - startXRef.current;

      if (dy <= 0) {
        if (pullingRef.current) {
          try {
            e.preventDefault();
          } catch {
            /* noop */
          }
        }
        resetPull();
        return;
      }

      if (!pullingRef.current && !isDibayPtrVerticalPullDown(dy, dx)) return;

      pullingRef.current = true;
      try {
        e.preventDefault();
      } catch {
        /* noop */
      }

      const next = computeDibayPtrPullPxFromTouchDy(dy);
      pullRef.current = next;
      if (next > DIBAY_PTR_THRESHOLD_PX * DIBAY_PTR_CLICK_SUPPRESS_RATIO) {
        pulledPastSuppressRef.current = true;
      }
      store.patch({ pullPx: next });
    };

    const onClickCapture = (e: MouseEvent) => {
      if (suppressClickUntilRef.current === 0) return;
      const within = performance.now() <= suppressClickUntilRef.current;
      suppressClickUntilRef.current = 0;
      if (!within) return;
      if (e.target instanceof Element && e.target.closest("a[href], button, [role='tab']")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onTouchEnd = () => {
      if (pulledPastSuppressRef.current) {
        pulledPastSuppressRef.current = false;
        suppressClickUntilRef.current = performance.now() + DIBAY_PTR_CLICK_SUPPRESS_WINDOW_MS;
      }
      if (!trackingRef.current && !pullingRef.current) return;

      const pulled = pullRef.current;
      trackingRef.current = false;
      pullingRef.current = false;

      if (pulled >= DIBAY_PTR_THRESHOLD_PX) {
        pullRef.current = 0;
        onReleaseRef.current(pulled);
        return;
      }
      resetPull();
    };

    const bindEl = (el: HTMLElement): (() => void) => {
      const optsCapture = { capture: true } as const;
      el.addEventListener("touchstart", onTouchStart, { passive: true, ...optsCapture });
      el.addEventListener("touchmove", onTouchMove, { passive: false, ...optsCapture });
      el.addEventListener("touchend", onTouchEnd, optsCapture);
      el.addEventListener("touchcancel", onTouchEnd, optsCapture);
      el.addEventListener("click", onClickCapture, { capture: true });
      return () => {
        el.removeEventListener("touchstart", onTouchStart, optsCapture);
        el.removeEventListener("touchmove", onTouchMove, optsCapture);
        el.removeEventListener("touchend", onTouchEnd, optsCapture);
        el.removeEventListener("touchcancel", onTouchEnd, optsCapture);
        el.removeEventListener("click", onClickCapture, optsCapture);
      };
    };

    const onExtraScroll = () => {
      if (!isScrollAtTop()) resetPull();
    };

    const bindAll = (): (() => void) | null => {
      const root = getMainAppScrollRootCached();
      if (!(root instanceof HTMLElement)) return null;
      const unbinds: Array<() => void> = [bindEl(root)];
      if (bindStickyHeader) {
        const sticky = document.querySelector("[data-app-sticky-header]");
        if (sticky instanceof HTMLElement && sticky !== root) unbinds.push(bindEl(sticky));
      }
      // `scroll` 은 버블하지 않음 — 자식 스크롤 컨테이너는 직접 구독
      for (const el of queryExtraScrollContainers(extraScrollContainerSelector)) {
        el.addEventListener("scroll", onExtraScroll, { passive: true });
        unbinds.push(() => el.removeEventListener("scroll", onExtraScroll));
      }
      root.dataset[rootDatasetKey] = "1";
      return () => {
        for (const u of unbinds) u();
      };
    };

    let unbind = bindAll();
    const retryId = window.setTimeout(() => {
      unbind?.();
      unbind = bindAll();
    }, 0);

    const unsubScroll = subscribeAppShellScroll(() => {
      if (!isScrollAtTop()) resetPull();
    });

    return () => {
      window.clearTimeout(retryId);
      unsubScroll();
      unbind?.();
      const cleanupRoot = getMainAppScrollRootCached();
      if (cleanupRoot instanceof HTMLElement) {
        delete cleanupRoot.dataset[rootDatasetKey];
      }
      resetPull();
      if (resetRefreshingOnCleanup && store.getSnapshot().refreshing) {
        store.patch({ refreshing: false, pullPx: 0 });
      }
    };
  }, [
    enabled,
    store,
    rootDatasetKey,
    bindStickyHeader,
    resetRefreshingOnCleanup,
    extraScrollContainerSelector,
    rebindKey,
  ]);
}
