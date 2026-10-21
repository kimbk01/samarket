"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * BK-05 — 미저장 폼의 브라우저 뒤로(기록 이동) 확인.
 *
 * Android 하드웨어 뒤로는 `useOverlayHardwareBack`, 헤더 ← 는 `useMyScreenBackGuard` 가 이미 막는다.
 * 남은 경로(브라우저·WebView 기록 뒤로 = Navigation API `traverse`)만 이 훅이 막는다.
 *
 * 계약 (Owner Q7):
 * - 가짜 기록을 쌓지 않는다 (`pushState` 없음) — 이동 자체를 취소(`preventDefault`)만 한다.
 * - 전역 가로채기 아님 — 폼이 dirty 인 동안만, 그 화면에서만 리스너가 붙는다.
 * - 타이머 없음.
 * Navigation API 가 없거나 취소 불가(`cancelable=false`, 사용자 입력 없음)면 기존 동작 그대로 이동한다.
 */

type NavigateEventLike = {
  navigationType?: string;
  cancelable?: boolean;
  preventDefault: () => void;
};

type NavigationTargetLike = {
  addEventListener?: (type: "navigate", fn: (e: NavigateEventLike) => void) => void;
  removeEventListener?: (type: "navigate", fn: (e: NavigateEventLike) => void) => void;
};

/** 막을 이동이면 true — 순수 판정 (테스트용) */
export function shouldBlockUnsavedTraverse(
  e: Pick<NavigateEventLike, "navigationType" | "cancelable">,
  released: boolean
): boolean {
  if (released) return false;
  if (e.navigationType !== "traverse") return false;
  return e.cancelable === true;
}

export function useUnsavedTraverseGuard(
  active: boolean,
  onBlocked: () => void
): { release: () => void } {
  const releasedRef = useRef(false);
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;

  useEffect(() => {
    if (active) releasedRef.current = false;
  }, [active]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const nav = (window as unknown as { navigation?: NavigationTargetLike }).navigation;
    if (!nav?.addEventListener || !nav.removeEventListener) return;
    const onNavigate = (e: NavigateEventLike) => {
      if (!shouldBlockUnsavedTraverse(e, releasedRef.current)) return;
      e.preventDefault();
      onBlockedRef.current();
    };
    nav.addEventListener("navigate", onNavigate);
    return () => nav.removeEventListener?.("navigate", onNavigate);
  }, [active]);

  /** 「나가기」 확정 직후 호출 — 이어지는 이동(뒤로 포함)을 막지 않는다 */
  const release = useCallback(() => {
    releasedRef.current = true;
  }, []);

  return { release };
}
