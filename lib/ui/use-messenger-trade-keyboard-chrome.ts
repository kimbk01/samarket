"use client";

import { useCallback, useEffect, useState } from "react";

/** 키보드·주소창 등으로 보이는 영역이 줄었을 때 열림으로 볼 overlap(px) */
const OVERLAP_OPEN_PX = 64;
/** 닫힘 판정 — 히스테리시스로 주소창·잡음과 구분 */
const OVERLAP_CLOSE_PX = 36;

/**
 * 거래 메신저 방 등: `visualViewport` 와 입력 포커스로 "키보드 크롬" 상태를 추정한다.
 * 기기·키보드 높이별로 직접 측정하지 않고, 레이아웃 뷰포트와 시각 뷰포트의 차이를 쓴다.
 */
export function useMessengerTradeKeyboardChrome(opts: {
  /** 거래 도크 + 좁은 화면 등 — false면 구독하지 않고 항상 닫힘 */
  enabled: boolean;
  /** 입력창 포커스(iOS 등에서 vv 갱신 지연 보강) */
  composerFocused: boolean;
}): { keyboardChromeOpen: boolean; overlapPx: number } {
  const { enabled, composerFocused } = opts;
  const [keyboardChromeOpen, setKeyboardChromeOpen] = useState(false);
  const [overlapPx, setOverlapPx] = useState(0);

  const measure = useCallback(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) {
      setOverlapPx(0);
      setKeyboardChromeOpen(composerFocused);
      return;
    }
    const inner = window.innerHeight;
    const bottom = vv.height + vv.offsetTop;
    const overlap = Math.max(0, Math.round(inner - bottom));
    setOverlapPx(overlap);
    setKeyboardChromeOpen((prev) => {
      if (composerFocused) return true;
      if (!prev && overlap >= OVERLAP_OPEN_PX) return true;
      if (prev && overlap <= OVERLAP_CLOSE_PX) return false;
      return prev;
    });
  }, [composerFocused]);

  useEffect(() => {
    if (!enabled) {
      setKeyboardChromeOpen(false);
      setOverlapPx(0);
      return;
    }
    measure();
    const vv = window.visualViewport;
    if (!vv) {
      return;
    }
    const onResize = () => {
      measure();
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [enabled, measure]);

  useEffect(() => {
    if (!enabled) return;
    measure();
  }, [composerFocused, enabled, measure]);

  return { keyboardChromeOpen, overlapPx };
}
