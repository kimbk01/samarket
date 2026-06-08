"use client";

/**
 * `[cm-rt-loop-diagnosis]` — `[cm-rt-loop-summary]` 와 같은 타이밍에 출력.
 * HMR(모듈 재평가) 직후 vs idle 중 churn 구분용 관측만; 구독 동작 변경 없음.
 */

import { isDebugMessengerEnabled } from "@/lib/community-messenger/debug/is-debug-messenger-enabled";
import {
  getAuthRefreshLastEndedAgeMs,
  getAuthSessionSignalAgeMs,
} from "@/lib/supabase/auth-refresh-telemetry";

const BOOT_AT_KEY = "__cmRtSubRetryModuleBootPerfMs";
const BOOT_COUNT_KEY = "__cmRtSubRetryModuleBootCount";

/** `subscribe-with-retry` 모듈이 다시 평가된 뒤 이 ms 이내 요약이면 HMR 직후로 본다 */
const FAST_REFRESH_WINDOW_MS = 15_000;
const AUTH_CHANGED_WINDOW_MS = 12_000;

let lastSummaryTopChannel: string | null = null;

let activeCountLookup: ((channelName: string) => number) | null = null;

export function registerCmRtLoopActiveCountLookup(fn: (channelName: string) => number): void {
  activeCountLookup = fn;
}

export function markCmRtSubscribeWithRetryModuleEval(): void {
  if (typeof window === "undefined") return;
  if (!isDebugMessengerEnabled()) return;
  const w = window as unknown as Record<string, unknown>;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  w[BOOT_COUNT_KEY] = (typeof w[BOOT_COUNT_KEY] === "number" ? w[BOOT_COUNT_KEY] : 0) + 1;
  w[BOOT_AT_KEY] = now;
}

function readBootState(): { bootCount: number; bootAt: number } {
  if (typeof window === "undefined") return { bootCount: 0, bootAt: 0 };
  const w = window as unknown as Record<string, unknown>;
  return {
    bootCount: typeof w[BOOT_COUNT_KEY] === "number" ? (w[BOOT_COUNT_KEY] as number) : 0,
    bootAt: typeof w[BOOT_AT_KEY] === "number" ? (w[BOOT_AT_KEY] as number) : 0,
  };
}

export function logCmRtLoopIntervalSummaryDiagnosis(
  top: Array<{ name: string; create: number; stop: number }>
): void {
  if (!isDebugMessengerEnabled()) return;
  const pathname = typeof window !== "undefined" ? window.location.pathname : null;
  const { bootCount, bootAt } = readBootState();
  const nowPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
  const msSinceModuleBoot = bootAt > 0 ? Math.round(nowPerf - bootAt) : null;
  const fast_refresh_detected =
    bootCount > 1 && msSinceModuleBoot != null && msSinceModuleBoot < FAST_REFRESH_WINDOW_MS;

  const visibility_state = typeof document !== "undefined" ? document.visibilityState : null;

  const topName = top[0]?.name ?? null;
  const old_key = lastSummaryTopChannel;
  const new_key = topName;
  lastSummaryTopChannel = topName;

  const lookup = activeCountLookup ?? (() => 0);
  const activeTop = topName != null ? lookup(topName) : 0;
  const had_existing_subscription = topName != null && activeTop > 0;

  const now = Date.now();
  const refreshAge = getAuthRefreshLastEndedAgeMs(now);
  const sessionAge = getAuthSessionSignalAgeMs(now);
  const auth_changed =
    (refreshAge != null && refreshAge < AUTH_CHANGED_WINDOW_MS) ||
    (sessionAge != null && sessionAge < AUTH_CHANGED_WINDOW_MS);

  try {
    // eslint-disable-next-line no-console -- dev-only loop classification
    console.warn("[cm-rt-loop-diagnosis]", {
      trigger: "interval_summary_loop_suspect",
      pathname,
      fast_refresh_detected,
      auth_changed,
      visibility_state,
      old_key,
      new_key,
      had_existing_subscription,
      activeCountTop: activeTop,
      ms_since_subscribe_with_retry_module_boot: msSinceModuleBoot,
      subscribe_with_retry_module_boot_count: bootCount,
      top,
    });
  } catch {
    /* ignore */
  }
}
