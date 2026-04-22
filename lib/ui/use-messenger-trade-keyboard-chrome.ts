"use client";

import { useCallback, useEffect, useState } from "react";
import { isLikelyIosWebKit } from "@/lib/ui/is-likely-ios-webkit";
import {
  readSamarketShellKeyboardBottomInsetCssPx,
  subscribeSamarketShellKeyboardInsets,
} from "@/lib/platform/samarket-shell-keyboard";

/** 기본(안드로이드·데스크톱 등): overlap 히스테리시스 */
const OVERLAP_OPEN_PX = 64;
const OVERLAP_CLOSE_PX = 36;

/** iOS Safari: innerHeight·vv 동기화가 늦고 값이 작게 나오는 경우가 많아 임계를 낮춤 */
const IOS_OVERLAP_OPEN_PX = 36;
const IOS_OVERLAP_CLOSE_PX = 22;

/** iOS: blur 직후 키보드가 아직 올라가 있으면 overlap이 잠깐 0으로 보일 수 있음 — 재측정 지연 */
const IOS_BLUR_REMEASURE_MS = 280;

/** iOS: 포커스 직후 vv·innerHeight 안정화 대기 */
const IOS_FOCUS_REMEASURE_EXTRA_MS = [100, 260] as const;

/**
 * 커뮤니티 메신저 **방**(일반·그룹·오픈·거래): `visualViewport`·네이티브 `samarketShell` 과 입력 포커스로
 * "키보드 크롬" 상태를 추정한다. iOS Safari는 이벤트·값 갱신이 한 박자 늦는 경우가 많아 rAF·지연 재측정을 추가한다.
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
    const ios = typeof window !== "undefined" && isLikelyIosWebKit();
    const openPx = ios ? IOS_OVERLAP_OPEN_PX : OVERLAP_OPEN_PX;
    const closePx = ios ? IOS_OVERLAP_CLOSE_PX : OVERLAP_CLOSE_PX;

    const shellInset = typeof window !== "undefined" ? readSamarketShellKeyboardBottomInsetCssPx() : null;
    if (shellInset != null) {
      setOverlapPx(shellInset);
      setKeyboardChromeOpen((prev) => {
        if (composerFocused) return true;
        if (!prev && shellInset >= openPx) return true;
        if (prev && shellInset <= closePx) return false;
        return prev;
      });
      return;
    }

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
      if (!prev && overlap >= openPx) return true;
      if (prev && overlap <= closePx) return false;
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
    const unsubShell = subscribeSamarketShellKeyboardInsets(measure);
    const vv = window.visualViewport;
    if (!vv) {
      return () => {
        unsubShell();
      };
    }
    const onResize = () => {
      measure();
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    /** iOS: 주소창·스크롤에 따른 vv 보정이 window scroll 과 엮이는 경우 */
    const ios = isLikelyIosWebKit();
    if (ios) {
      window.addEventListener("scroll", onResize, { passive: true });
    }
    return () => {
      unsubShell();
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (ios) {
        window.removeEventListener("scroll", onResize);
      }
    };
  }, [enabled, measure]);

  useEffect(() => {
    if (!enabled) return;
    measure();
  }, [composerFocused, enabled, measure]);

  /** 포커스 직후: rAF 연속 + iOS는 지연 재측정으로 키보드 애니메이션 반영 */
  useEffect(() => {
    if (!enabled || !composerFocused) return;
    let alive = true;
    const bump = () => {
      if (alive) measure();
    };
    bump();
    let rafInner = 0;
    const raf1 = requestAnimationFrame(() => {
      rafInner = requestAnimationFrame(bump);
    });
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (isLikelyIosWebKit()) {
      for (const ms of IOS_FOCUS_REMEASURE_EXTRA_MS) {
        timers.push(setTimeout(bump, ms));
      }
    }
    return () => {
      alive = false;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(rafInner);
      timers.forEach(clearTimeout);
    };
  }, [composerFocused, enabled, measure]);

  /** iOS: blur 직후 한동안 overlap·vv가 불안정 — 짧은 지연 후 재측정해 크롬이 너무 일찍 펼쳐지는 것 완화 */
  useEffect(() => {
    if (!enabled || composerFocused) return;
    if (!isLikelyIosWebKit()) return;
    const t = window.setTimeout(() => measure(), IOS_BLUR_REMEASURE_MS);
    return () => window.clearTimeout(t);
  }, [composerFocused, enabled, measure]);

  return { keyboardChromeOpen, overlapPx };
}
