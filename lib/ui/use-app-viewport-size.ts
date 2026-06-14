"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 공통 앱 뷰포트 크기·breakpoint hook — Android·iOS 분기 없이 동일 규칙.
 *
 * 정책:
 * - `resize` · `orientationchange` · `visualViewport.resize/scroll` 을 한 곳에서 듣고
 *   `requestAnimationFrame` 으로 합쳐 setState (이벤트 폭주 방지).
 * - **메신저 방** 키보드/스크롤 보정에는 사용하지 않는다 — `use-chat-viewport-shell-insets` /
 *   `useMobileKeyboardInset` / `useMessengerTradeKeyboardChrome` 의 기존 계약을 유지한다.
 *   (이 훅은 글쓰기·일반 시트·하단 고정 CTA 등 일반 화면 전용)
 *
 * width 기준(헌장):
 * - mobile:           0 ~ 767    폰 세로 (iPhone SE~Max, Galaxy S)
 * - phone-landscape:  768 ~ 1023 + isLandscape=true + !isTouchTablet
 * - tablet-portrait:  768 ~ 1023 + (!isLandscape OR isTouchTablet)
 * - tablet:           1024 ~ 1279 (iPad Air/Pro 가로, Galaxy Tab 세로 등)
 * - desktop:          1280+, maxTouchPoints < 2 (Galaxy Tab 가로 등 터치 기기는 tablet)
 *
 * isTouchTablet 판별: maxTouchPoints >= 2 + width 768~1279 범위
 */

export type AppViewportBreakpoint =
  | "mobile"
  | "phone-landscape"
  | "tablet-portrait"
  | "tablet"
  | "desktop";

export type AppViewportSize = {
  /** layout viewport width (px) */
  width: number;
  /** layout viewport height (px) — 보통 `window.innerHeight` */
  height: number;
  /** visualViewport.height — 키보드/주소창 변동 반영 (지원 안 하면 layout height 와 동일) */
  visualHeight: number;
  /** width + touch + orientation 기반 5단계 */
  breakpoint: AppViewportBreakpoint;
  /** 가로 모드 추정 — `width > height` (정사각·여백은 mobile 로 남음) */
  isLandscape: boolean;
  /** 터치 태블릿 추정 — maxTouchPoints >= 2, width 768+ */
  isTouchTablet: boolean;
};

const SSR_FALLBACK: AppViewportSize = {
  width: 360,
  height: 720,
  visualHeight: 720,
  breakpoint: "mobile",
  isLandscape: false,
  isTouchTablet: false,
};

/**
 * maxTouchPoints >= 2 이고 width 768+ 이면 터치 태블릿으로 추정.
 * Galaxy Tab S9 가로(1280px)처럼 desktop 폭이어도 태블릿으로 분류할 때 사용.
 */
function detectTouchTablet(width: number): boolean {
  if (typeof navigator === "undefined") return false;
  return width >= 768 && navigator.maxTouchPoints >= 2;
}

function pickBreakpoint(width: number, isLandscape: boolean, isTouchTablet: boolean): AppViewportBreakpoint {
  // 1280px+ 이지만 터치 기기(Galaxy Tab 가로 등) → tablet
  if (width >= 1280) return isTouchTablet ? "tablet" : "desktop";
  if (width >= 1024) return "tablet";
  if (width >= 768) {
    // 768~1023: 폰 가로 vs 태블릿 세로 구분
    // isTouchTablet(maxTouchPoints>=2) 이거나 세로 모드이면 tablet-portrait
    if (isTouchTablet || !isLandscape) return "tablet-portrait";
    return "phone-landscape";
  }
  return "mobile";
}

function readCurrentSize(): AppViewportSize {
  if (typeof window === "undefined") return SSR_FALLBACK;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const vv = window.visualViewport;
  const visualH = vv?.height ?? h;
  const isLandscape = w > h;
  const isTouchTablet = detectTouchTablet(w);
  return {
    width: w,
    height: h,
    visualHeight: visualH,
    breakpoint: pickBreakpoint(w, isLandscape, isTouchTablet),
    isLandscape,
    isTouchTablet,
  };
}

function viewportSizesEqual(a: AppViewportSize, b: AppViewportSize): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.visualHeight === b.visualHeight &&
    a.breakpoint === b.breakpoint &&
    a.isLandscape === b.isLandscape &&
    a.isTouchTablet === b.isTouchTablet
  );
}

export function useAppViewportSize(): AppViewportSize {
  const [size, setSize] = useState<AppViewportSize>(() => readCurrentSize());
  const prevRef = useRef<AppViewportSize>(size);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let rafId = 0;
    const sync = () => {
      rafId = 0;
      const next = readCurrentSize();
      if (viewportSizesEqual(prevRef.current, next)) return;
      prevRef.current = next;
      setSize(next);
    };
    const schedule = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(sync);
    };

    /** 진입 직후 한 번 실측 — SSR fallback 으로 시작했어도 첫 commit 에서 보정 */
    schedule();

    const vv = window.visualViewport ?? null;
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
    };
  }, []);

  return size;
}

/** 자주 쓰는 단편 — 페이지에서 width 만 필요할 때 */
export function useAppViewportBreakpoint(): AppViewportBreakpoint {
  return useAppViewportSize().breakpoint;
}

/** 폰 세로(0~767px) 인지 여부만 필요할 때 */
export function useIsAppViewportMobile(): boolean {
  return useAppViewportBreakpoint() === "mobile";
}

/** 태블릿 이상(tablet-portrait·tablet·desktop) 인지 여부 */
export function useIsAppViewportTabletOrAbove(): boolean {
  const bp = useAppViewportBreakpoint();
  return bp === "tablet-portrait" || bp === "tablet" || bp === "desktop";
}
