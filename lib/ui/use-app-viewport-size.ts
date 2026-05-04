"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 공통 앱 뷰포트 크기·breakpoint hook — Android·iOS 분기 없이 동일 규칙.
 *
 * 정책:
 * - `resize` · `orientationchange` · `visualViewport.resize/scroll` 을 한 곳에서 듣고
 *   `requestAnimationFrame` 으로 합쳐 setState (이벤트 폭주 방지).
 * - **메신저 방** 키보드/스크롤 보정에는 사용하지 않는다 — 그쪽은 `useChatViewportResize` /
 *   `useMobileKeyboardInset` / `useMessengerTradeKeyboardChrome` 의 기존 계약을 유지한다.
 *   (이 훅은 글쓰기·일반 시트·하단 고정 CTA 등 일반 화면 전용)
 *
 * width 기준(헌장):
 * - mobile: 0 ~ 767
 * - mobile-landscape-or-tablet: 768 ~ 1023
 * - tablet: 1024 ~ 1279
 * - desktop: 1280+
 */

export type AppViewportBreakpoint =
  | "mobile"
  | "mobile-landscape-or-tablet"
  | "tablet"
  | "desktop";

export type AppViewportSize = {
  /** layout viewport width (px) */
  width: number;
  /** layout viewport height (px) — 보통 `window.innerHeight` */
  height: number;
  /** visualViewport.height — 키보드/주소창 변동 반영 (지원 안 하면 layout height 와 동일) */
  visualHeight: number;
  /** width 기반 4단계 */
  breakpoint: AppViewportBreakpoint;
  /** 가로 모드 추정 — `width > height` (정사각·여백은 mobile 로 남음) */
  isLandscape: boolean;
};

const SSR_FALLBACK: AppViewportSize = {
  width: 360,
  height: 720,
  visualHeight: 720,
  breakpoint: "mobile",
  isLandscape: false,
};

function pickBreakpoint(width: number): AppViewportBreakpoint {
  if (width >= 1280) return "desktop";
  if (width >= 1024) return "tablet";
  if (width >= 768) return "mobile-landscape-or-tablet";
  return "mobile";
}

function readCurrentSize(): AppViewportSize {
  if (typeof window === "undefined") return SSR_FALLBACK;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const vv = window.visualViewport;
  const visualH = vv?.height ?? h;
  return {
    width: w,
    height: h,
    visualHeight: visualH,
    breakpoint: pickBreakpoint(w),
    isLandscape: w > h,
  };
}

function viewportSizesEqual(a: AppViewportSize, b: AppViewportSize): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.visualHeight === b.visualHeight &&
    a.breakpoint === b.breakpoint &&
    a.isLandscape === b.isLandscape
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

/** 모바일 폭(0~767px) 인지 여부만 필요할 때 */
export function useIsAppViewportMobile(): boolean {
  return useAppViewportBreakpoint() === "mobile";
}
