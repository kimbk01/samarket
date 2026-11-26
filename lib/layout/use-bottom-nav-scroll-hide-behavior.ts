"use client";

import { useEffect, useRef, useState } from "react";
import {
  FAB_SCROLL_MOVE_THRESHOLD_PX,
  FAB_SCROLL_TOP_REVEAL_Y_PX,
  resolveBottomNavScrollChromeAction,
} from "@/lib/layout/main-bottom-nav-fab-scroll-signal";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";
import { isPhilifeNeighborhoodPostDetailPathname } from "@/lib/layout/conditional-app-shell-flags";
import {
  getMainAppScrollRootCached,
  getMainAppScrollTop,
  invalidateMainAppScrollRootCache,
} from "@/lib/layout/main-app-scroll-root";
import { isMessengerCallLogsBottomNavScrollHideSurface } from "@/lib/layout/messenger-call-logs-scroll-chrome-surface";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import {
  isDocumentScrollRoot,
  isMainAppScrollBodyOverflowing,
} from "@/lib/ui/store-detail-scroll-root";
import { isCommunityHomeSurfacePath, isHomeSurfacePath } from "@/lib/layout/resolve-main-surface";
import { subscribeBottomNavResume } from "@/lib/main-menu/bottom-nav-resume-signal";
import { NAV_SWITCHING_HTML_ATTR } from "@/lib/device/use-nav-presentation-switch-motion";

/** 마지막 스크롤 이후 이 시간이 지나면 (탭이 접혀 있을 때) 다시 펼침 */
export const BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS = 1800;

/**
 * v6 R2-4 (Owner 2026-11-17 시안 v6 승인) — 창 폭이 바뀐 직후(회전·화면 나누기) 목록이 다시 배치되며 생기는 스크롤 위치
 * 변화는 사용자 스크롤이 아니다. 이 시간 동안은 숨기지 않고 기준 위치만 다시 잡는다.
 * 실측: Xiaomi 회전 후 목록 재배치·스크롤 이벤트가 약 0.5초 안에 끝남(11-17 녹화 73.0→73.7초). 회전 애니메이션 280ms 보다 길게.
 */
export const BOTTOM_NAV_WIDTH_CHANGE_SETTLE_MS = 600;

const MESSENGER_HUB_LIST_SCROLL_SELECTOR = "[data-messenger-hub-list-scroll]";

function readMessengerHubListScrollTop(): number | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(MESSENGER_HUB_LIST_SCROLL_SELECTOR);
  if (!(el instanceof HTMLElement)) return null;
  return el.scrollTop;
}

function isMessengerHubListOverflowing(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.querySelector(MESSENGER_HUB_LIST_SCROLL_SELECTOR);
  if (!(el instanceof HTMLElement)) return false;
  return el.scrollHeight > el.clientHeight + 1;
}

/**
 * 하단 탭 스크롤 숨김 규칙표 — 단일 정의 (크롬 S4 · Owner 결정 2 「권고대로」 2026-11-02).
 * 원칙: 긴 목록·피드 화면만 아래로 스크롤 시 숨김(위로 스크롤·맨 위·1.8초 정지 시 즉시 표시),
 *       내정보·설정·입력 화면은 고정. 그 밖 경로는 기본 고정(false).
 *
 * | 화면 | 숨김 | 근거 |
 * |---|---|---|
 * | 커뮤니티 피드(헤더 메신저 열림 제외)·동네 글 상세 | on | 긴 피드 |
 * | 거래 목록(플로팅 메뉴 면) | on | 긴 목록 |
 * | 메신저 허브·거래/배달 채팅 목록·통화 기록 | on | 긴 목록 (`isMessengerBottomNavScrollHideSurface`) — 목록 inset 은 숨김과 무관하게 고정(반복 방지 계약) |
 * | 배달 홈·업종 목록 | **off** | 배달 계약: 하단 내비 항상 고정 (`delivery-category-compare-design-2026-10-29.md` §7) |
 * | 배달 그 밖(`/stores/*`) | on | 기존 그대로 (배달 계약 범위 밖 변경 금지) |
 * | 내정보 홈 `/mypage` | off | 내정보·설정 고정 (translateY 흔들림 실측) |
 */
export function resolveBottomNavScrollHideEnabled(
  pathNoQuery: string,
  headerMessengerFromPhilife: boolean,
  search?: string | null
): boolean {
  /** 앱 홈 — 피드형 긴 화면, 커뮤니티 피드와 같이 스크롤 시 숨김 */
  if (isHomeSurfacePath(pathNoQuery)) return true;
  if (isCommunityHomeSurfacePath(pathNoQuery)) {
    return !headerMessengerFromPhilife;
  }
  if (isPhilifeNeighborhoodPostDetailPathname(pathNoQuery)) return true;
  /** `/mypage` hub: keep bottom nav fixed — do not enable scroll-hide */
  if (pathNoQuery === "/mypage") return false;
  if (isTradeFloatingMenuSurface(pathNoQuery)) return true;
  /**
   * WP3 — 배달 홈·업종 목록은 하단 탭 항상 고정 (스크롤 숨김 없음).
   * 그 밖의 `/stores/*`(매장 상세 등)는 기존 그대로.
   */
  if (pathNoQuery === "/stores" || pathNoQuery === "/stores/browse" || pathNoQuery.startsWith("/stores/browse/")) {
    return false;
  }
  if (pathNoQuery.startsWith("/stores/")) return true;
  if (isMessengerCallLogsBottomNavScrollHideSurface(pathNoQuery, search)) return true;
  return false;
}

/**
 * `enabled` 가 false 이면 숨김 상태로 리셋(경로 이탈·푸시 열림 등).
 * `routeScrollKey` — pathname+search 변경 시 `lastY` 재동기화(거래 1차 탭·주제 칩 전환).
 */
export function useBottomNavScrollHide(enabled: boolean, routeScrollKey = ""): boolean {
  const [hidden, setHidden] = useState(false);
  const lastYRef = useRef(0);
  const idleRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 앱 복귀 즉시 하단 탭을 다시 보이게 — 숨겨진 동안 스크롤·크기 이벤트를 놓쳐 숨김으로 남지 않게 (계약 v2 · B4) */
  useEffect(
    () =>
      subscribeBottomNavResume(() => {
        if (idleRevealTimerRef.current != null) {
          clearTimeout(idleRevealTimerRef.current);
          idleRevealTimerRef.current = null;
        }
        setHidden(false);
      }),
    []
  );

  useEffect(() => {
    if (!enabled) {
      if (idleRevealTimerRef.current != null) {
        clearTimeout(idleRevealTimerRef.current);
        idleRevealTimerRef.current = null;
      }
      setHidden(false);
      return;
    }
    invalidateMainAppScrollRootCache();
    setHidden(false);

    const clearIdleReveal = () => {
      if (idleRevealTimerRef.current != null) {
        clearTimeout(idleRevealTimerRef.current);
        idleRevealTimerRef.current = null;
      }
    };

    const resolveScrollY = () => readMessengerHubListScrollTop() ?? getMainAppScrollTop();

    /**
     * 재감사 2026-11-26 §9 A3 (`docs/audit/app-entry-reaudit-responsibility-ssot-2026-11-26.md`):
     * 시작 기준 위치를 효과 안에서 바로 읽으면 `getComputedStyle` 이 그리기 전 스타일 계산을 강제했다
     * (앱 시작 성능 기록 Samsung 38~50ms). 다음 그리기 프레임에서 읽는다. 그 전에 스크롤이 먼저 오면 그 위치를 기준으로 삼는다.
     */
    let initialYRaf = window.requestAnimationFrame(() => {
      initialYRaf = 0;
      lastYRef.current = resolveScrollY();
    });

    const resolveOverflowing = () =>
      isMessengerHubListOverflowing() || isMainAppScrollBodyOverflowing();

    /** v6 R2-4 — 창 폭 변경(회전) 직후 재배치 동안: 숨기지 않고 기준만 다시 잡는다 */
    let lastWidth = window.innerWidth;
    /**
     * 세로 메뉴 → 하단 탭으로 바뀌는 순간(회전) 이 훅이 새로 켜진다 — 세로 메뉴에는 스크롤 숨김이 없어 꺼져 있었다.
     * 그때 목록이 내려가 있어도 바로 숨기지 않게 같은 재배치 시간을 둔다. 메뉴 전환 표시는 같은 커밋의 레이아웃 효과
     * (`useNavPresentationSwitchMotion`)가 이 효과보다 먼저 `<html>` 에 단다. 일반 화면 진입은 그대로(표시 없음).
     */
    let widthSettleUntil = document.documentElement.hasAttribute(NAV_SWITCHING_HTML_ATTR)
      ? performance.now() + BOTTOM_NAV_WIDTH_CHANGE_SETTLE_MS
      : 0;
    const isSettlingAfterWidthChange = () =>
      widthSettleUntil > 0 && performance.now() < widthSettleUntil;

    const applyScrollChrome = (y: number) => {
      if (isSettlingAfterWidthChange()) {
        lastYRef.current = y;
        return;
      }
      if (initialYRaf) {
        window.cancelAnimationFrame(initialYRaf);
        initialYRaf = 0;
        lastYRef.current = y;
        return;
      }
      if (!resolveOverflowing()) {
        setHidden(false);
        lastYRef.current = y;
        return;
      }
      const last = lastYRef.current;
      const action = resolveBottomNavScrollChromeAction(last, y);
      if (action === "hide") {
        setHidden(true);
      } else if (action === "reveal") {
        setHidden(false);
      }
      lastYRef.current = y;
    };

    /** 피드 로드·push 후 overflow 생길 때 — 이미 아래로 스크롤한 상태면 즉시 hide */
    const syncScrollChromeFromLayout = () => {
      invalidateMainAppScrollRootCache();
      const y = resolveScrollY();
      if (isSettlingAfterWidthChange()) {
        lastYRef.current = y;
        return;
      }
      if (
        resolveOverflowing() &&
        y >= FAB_SCROLL_TOP_REVEAL_Y_PX + FAB_SCROLL_MOVE_THRESHOLD_PX
      ) {
        setHidden(true);
        lastYRef.current = y;
        return;
      }
      applyScrollChrome(y);
    };

    const onScroll = () => {
      const y = resolveScrollY();
      applyScrollChrome(y);

      clearIdleReveal();
      idleRevealTimerRef.current = setTimeout(() => {
        idleRevealTimerRef.current = null;
        setHidden((prev) => (prev ? false : prev));
      }, BOTTOM_NAV_REVEAL_AFTER_SCROLL_IDLE_MS);
    };

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      const width = window.innerWidth;
      if (width !== lastWidth) {
        /** v6 R2-4 — 회전·화면 나누기: 하단 탭을 바로 보이게 하고, 재배치가 끝날 때까지 숨기지 않는다 */
        lastWidth = width;
        widthSettleUntil = performance.now() + BOTTOM_NAV_WIDTH_CHANGE_SETTLE_MS;
        clearIdleReveal();
        setHidden(false);
        lastYRef.current = resolveScrollY();
      }
      if (resizeTimer != null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        syncScrollChromeFromLayout();
      }, 100);
    };

    const unsubScroll = subscribeAppShellScroll(onScroll, {
      passive: true,
      onTargetsChanged: syncScrollChromeFromLayout,
    });

    const hubListEl = document.querySelector(MESSENGER_HUB_LIST_SCROLL_SELECTOR);
    const onHubListScroll = () => onScroll();
    if (hubListEl instanceof HTMLElement) {
      hubListEl.addEventListener("scroll", onHubListScroll, { passive: true });
    }

    window.addEventListener("resize", onResize, { passive: true });
    syncScrollChromeFromLayout();

    let syncRaf = 0;
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      syncRaf = window.requestAnimationFrame(() => {
        syncRaf = window.requestAnimationFrame(() => {
          syncRaf = 0;
          syncScrollChromeFromLayout();
        });
      });
    }

    let scrollRootResizeObserver: ResizeObserver | null = null;
    let observedScrollRoot: HTMLElement | null = null;

    const bindScrollRootResizeObserver = () => {
      invalidateMainAppScrollRootCache();
      let root: HTMLElement;
      try {
        root = getMainAppScrollRootCached();
      } catch {
        return;
      }
      if (isDocumentScrollRoot(root)) {
        scrollRootResizeObserver?.disconnect();
        scrollRootResizeObserver = null;
        observedScrollRoot = null;
        return;
      }
      if (observedScrollRoot === root) return;
      scrollRootResizeObserver?.disconnect();
      observedScrollRoot = root;
      if (typeof ResizeObserver === "undefined") return;
      scrollRootResizeObserver = new ResizeObserver(() => {
        syncScrollChromeFromLayout();
      });
      scrollRootResizeObserver.observe(root);
    };

    /** §9 A3: 효과 안 즉시 연결은 스크롤 루트 판별(`getComputedStyle`)을 강제한다 — 0ms 타이머가 같은 일을 한다. */
    const scrollRootBindTimers = [0, 50, 150, 450].map((ms) =>
      window.setTimeout(bindScrollRootResizeObserver, ms)
    );

    return () => {
      unsubScroll();
      if (hubListEl instanceof HTMLElement) {
        hubListEl.removeEventListener("scroll", onHubListScroll);
      }
      window.removeEventListener("resize", onResize);
      if (resizeTimer != null) clearTimeout(resizeTimer);
      if (syncRaf) window.cancelAnimationFrame(syncRaf);
      if (initialYRaf) window.cancelAnimationFrame(initialYRaf);
      for (const timer of scrollRootBindTimers) {
        window.clearTimeout(timer);
      }
      scrollRootResizeObserver?.disconnect();
      observedScrollRoot = null;
      clearIdleReveal();
    };
  }, [enabled, routeScrollKey]);

  return hidden;
}
