"use client";

import { useLayoutEffect } from "react";

/**
 * 통화 풀스크린·수신 오버레이 ↔ `ConditionalAppShell` 메인 BottomNav.
 * pathname(`/community-messenger` 허브)만으로는 수신 벨 표면을 표현할 수 없다.
 */

let suppressCount = 0;
const listeners = new Set<() => void>();

function notifySuppressListeners(): void {
  for (const l of listeners) l();
}

/** 사유별 누적 — 언마운트 시 다른 통화 표면이 남아 있으면 suppress 유지 */
export function pushMessengerCallMainBottomNavSuppressed(): () => void {
  suppressCount += 1;
  notifySuppressListeners();
  return () => {
    suppressCount = Math.max(0, suppressCount - 1);
    notifySuppressListeners();
  };
}

export function getMessengerCallMainBottomNavSuppressed(): boolean {
  return suppressCount > 0;
}

export function subscribeMessengerCallMainBottomNavSuppressed(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}

/** 풀스크린 통화·수신 오버레이 표시 중 메인 하단 탭 억제 */
export function useMessengerCallMainBottomNavSuppress(enabled: boolean): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    return pushMessengerCallMainBottomNavSuppressed();
  }, [enabled]);
}
