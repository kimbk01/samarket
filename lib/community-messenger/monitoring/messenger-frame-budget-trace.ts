"use client";

import { messengerMonitorRenderFrameBudget } from "./client";

/** opt-in — 기본은 꺼짐; 켜진 경우에만 rAF 샘플 스케줄 */
export function isMessengerFrameBudgetTraceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return (process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET ?? "").trim() === "1";
}

let lastScrollSampleAt = 0;
const SCROLL_SAMPLE_MIN_GAP_MS = 250;

/**
 * 방 타임라인이 붙은 직후 — 연속 rAF 4번으로 프레임 간격 3회만 측정 (무한 루프 없음).
 */
export function runMessengerRoomOpenFrameBudgetTrace(roomId: string): void {
  if (!isMessengerFrameBudgetTraceEnabled()) return;
  requestAnimationFrame((t0) => {
    requestAnimationFrame((t1) => {
      const d1 = t1 - t0;
      messengerMonitorRenderFrameBudget(roomId, d1, { phase: "room_open", frameIndex: "1" });
      requestAnimationFrame((t2) => {
        const d2 = t2 - t1;
        messengerMonitorRenderFrameBudget(roomId, d2, { phase: "room_open", frameIndex: "2" });
        requestAnimationFrame((t3) => {
          const d3 = t3 - t2;
          messengerMonitorRenderFrameBudget(roomId, d3, { phase: "room_open", frameIndex: "3" });
        });
      });
    });
  });
}

/**
 * 스크롤 코얼레스된 프레임 이후 — 더블 rAF 1회로 한 간격만 샘플 (스로틀).
 */
export function sampleMessengerScrollFrameBudget(roomId: string): void {
  if (!isMessengerFrameBudgetTraceEnabled()) return;
  const now = performance.now();
  if (now - lastScrollSampleAt < SCROLL_SAMPLE_MIN_GAP_MS) return;
  lastScrollSampleAt = now;
  requestAnimationFrame((t1) => {
    requestAnimationFrame((t2) => {
      const ms = t2 - t1;
      messengerMonitorRenderFrameBudget(roomId, ms, { phase: "scroll" });
    });
  });
}
