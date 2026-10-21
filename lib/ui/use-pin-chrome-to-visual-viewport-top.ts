"use client";

import { useEffect, type RefObject } from "react";

/**
 * iOS WKWebView 는 키보드가 열리면 레이아웃을 줄이지 않고 화면을 위로 민다(visualViewport pan / 문서 스크롤).
 * 흐름 안에 있는 상단 헤더가 같이 밀려 뒤로가기가 가려지므로, 헤더를 보이는 영역 상단까지 내려 고정한다.
 * 밀림이 없으면(Android adjustResize·키보드 닫힘) 이동량 0 — 아무것도 바꾸지 않는다.
 */
export function resolvePinnedChromeOffsetPx(args: {
  naturalTopPx: number;
  visualViewportOffsetTopPx: number;
}): number {
  const next = Math.round(args.visualViewportOffsetTopPx - args.naturalTopPx);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

export function usePinChromeToVisualViewportTop(
  chromeRef: RefObject<HTMLElement | null>,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const el = chromeRef.current;
    if (!el) return;

    let appliedPx = 0;
    let raf = 0;

    const apply = () => {
      raf = 0;
      const naturalTopPx = el.getBoundingClientRect().top - appliedPx;
      const next = resolvePinnedChromeOffsetPx({
        naturalTopPx,
        visualViewportOffsetTopPx: window.visualViewport?.offsetTop ?? 0,
      });
      if (next === appliedPx) return;
      appliedPx = next;
      el.style.transform = next > 0 ? `translate3d(0, ${next}px, 0)` : "";
    };

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };

    const vv = window.visualViewport;
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    schedule();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      el.style.transform = "";
    };
  }, [chromeRef, enabled]);
}
