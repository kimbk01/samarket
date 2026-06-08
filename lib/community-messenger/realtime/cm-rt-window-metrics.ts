"use client";

/**
 * Realtime churn — **최근 window** 기준(누적 since reload 과 분리).
 * `[cm-rt-window-summary]` — `DEBUG_MESSENGER` 일 때만.
 */

import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";

type WindowKind = "home_create" | "final_stop" | "cancel_stop" | "reuse_existing";

const events: Array<{ t: number; kind: WindowKind }> = [];
const MAX_EVENTS = 600;
const PRUNE_MS = 65_000;

let windowSummaryTimer: ReturnType<typeof setInterval> | null = null;
/** 진단 타이머 — 무활동 시 정지 (subscribe-with-retry loop summary 와 동일) */
const WINDOW_SUMMARY_IDLE_TICKS_TO_STOP = 6;
let windowSummaryIdleTickCount = 0;

function nowMs(): number {
  return Date.now();
}

function stopWindowSummaryTimer(): void {
  if (windowSummaryTimer == null) return;
  clearInterval(windowSummaryTimer);
  windowSummaryTimer = null;
  windowSummaryIdleTickCount = 0;
}

function ensureWindowSummaryTimer(): void {
  if (!isDebugMessengerEnabled()) return;
  if (windowSummaryTimer != null) return;
  windowSummaryIdleTickCount = 0;
  windowSummaryTimer = setInterval(() => {
    if (!isDebugMessengerEnabled()) {
      stopWindowSummaryTimer();
      return;
    }
    try {
      const hasRecentEvents = events.length > 0;
      if (!hasRecentEvents) {
        windowSummaryIdleTickCount += 1;
        if (windowSummaryIdleTickCount >= WINDOW_SUMMARY_IDLE_TICKS_TO_STOP) {
          stopWindowSummaryTimer();
        }
        return;
      }
      windowSummaryIdleTickCount = 0;
      emitCmRtWindowSummaryNow();
    } catch {
      /* ignore */
    }
  }, 12_000);
}

function pruneOld(): void {
  const cutoff = nowMs() - PRUNE_MS;
  while (events.length > 0 && events[0].t < cutoff) {
    events.shift();
  }
}

function push(kind: WindowKind): void {
  if (!isDebugMessengerEnabled()) return;
  pruneOld();
  if (events.length >= MAX_EVENTS) events.shift();
  events.push({ t: nowMs(), kind });
  ensureWindowSummaryTimer();
}

/** `subscribeWithRetry` — `community-messenger-home:*` 물리 create 만 */
export function recordCmRtWindowHomePhysicalCreate(): void {
  push("home_create");
}

/** `[cm-rt-grace]` — grace keepalive 이벤트 */
export function recordCmRtWindowGraceAction(action: "final_stop" | "cancel_stop" | "reuse_existing"): void {
  push(action);
}

function countSince(ms: number, kind: WindowKind): number {
  const t0 = nowMs() - ms;
  let n = 0;
  for (const e of events) {
    if (e.t >= t0 && e.kind === kind) n += 1;
  }
  return n;
}

function churnLevel(args: {
  last60s_create: number;
  last60s_final_stop: number;
  reuse_existing_count: number;
  cancel_stop_count: number;
}): "low" | "medium" | "high" {
  const { last60s_create, last60s_final_stop, reuse_existing_count, cancel_stop_count } = args;
  const graceHits = reuse_existing_count + cancel_stop_count;
  if (last60s_final_stop === 0 && last60s_create <= 2) return "low";
  if (last60s_final_stop >= 3) return "high";
  if (last60s_final_stop >= 1 && graceHits === 0 && last60s_create >= 4) return "high";
  if (last60s_final_stop >= 1 && graceHits >= last60s_final_stop * 2) return "low";
  if (last60s_final_stop === 0 && last60s_create >= 6) return "medium";
  return "medium";
}

/**
 * `[cm-rt-loop-summary]` 와 같은 틱에서 호출해도 되고, 단독 호출해도 된다.
 */
export function emitCmRtWindowSummaryNow(): void {
  if (!isDebugMessengerEnabled()) return;
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  pruneOld();
  const last30s_create = countSince(30_000, "home_create");
  const last30s_final_stop = countSince(30_000, "final_stop");
  const last60s_create = countSince(60_000, "home_create");
  const last60s_final_stop = countSince(60_000, "final_stop");
  const reuse_existing_count = countSince(60_000, "reuse_existing");
  const cancel_stop_count = countSince(60_000, "cancel_stop");
  const graceDenom = Math.max(1, reuse_existing_count + cancel_stop_count + last60s_final_stop);
  const reuse_ratio = reuse_existing_count / graceDenom;
  const cancel_ratio = cancel_stop_count / graceDenom;
  const physical_stop_rate = last60s_final_stop / Math.max(1, last60s_create);
  const churn_level = churnLevel({
    last60s_create,
    last60s_final_stop,
    reuse_existing_count,
    cancel_stop_count,
  });
  try {
    // eslint-disable-next-line no-console -- DEBUG_MESSENGER window churn summary
    console.warn("[cm-rt-window-summary]", {
      last30s_create,
      last30s_final_stop,
      last60s_create,
      last60s_final_stop,
      reuse_existing_count,
      cancel_stop_count,
      reuse_ratio: Math.round(reuse_ratio * 1000) / 1000,
      cancel_ratio: Math.round(cancel_ratio * 1000) / 1000,
      physical_stop_rate: Math.round(physical_stop_rate * 1000) / 1000,
      churn_level,
      note: "rolling window from in-tab events; not reset on navigation",
    });
  } catch {
    /* ignore */
  }
}
