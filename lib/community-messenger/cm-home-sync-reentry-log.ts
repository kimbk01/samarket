"use client";

/**
 * 클라이언트 `home-sync` 재진입·중복 진단 — 기본 off.
 * `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` 또는 `localStorage samarket:debug:homeSyncReentry=1`.
 */

export function shouldLogHomeSyncReentry(): boolean {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE === "1") return true;
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;
  try {
    return window.localStorage.getItem("samarket:debug:homeSyncReentry") === "1";
  } catch {
    return false;
  }
}

export function logHomeSyncReentry(payload: Record<string, unknown>): void {
  if (!shouldLogHomeSyncReentry()) return;
  // eslint-disable-next-line no-console -- gated reentry diagnostic
  console.debug("[home-sync-reentry]", payload);
}
