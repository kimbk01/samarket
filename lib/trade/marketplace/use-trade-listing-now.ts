"use client";

import { useSyncExternalStore } from "react";

/**
 * 거래 작성 시각 표시용 공용 시계 — 카드마다 타이머를 두지 않고 1개만 돈다.
 * 서버·첫 그림은 null(시각 미표시) → 마운트 후 폰 시각으로 채워 hydration 불일치를 막는다.
 */
const TICK_MS = 60_000;
let nowMs = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit() {
  nowMs = Date.now();
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer == null) {
    nowMs = Date.now();
    timer = setInterval(emit, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return nowMs || Date.now();
}

function getServerSnapshot(): number | null {
  return null;
}

export function useTradeListingNowMs(): number | null {
  return useSyncExternalStore<number | null>(subscribe, getSnapshot, getServerSnapshot);
}
