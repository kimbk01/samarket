"use client";

/**
 * 클라이언트 `home-sync` 재진입·중복 진단 — 개발 기본 on,
 * 운영은 `localStorage.setItem("samarket:debug:homeSyncReentry","1")` 후 새로고침.
 */

export function shouldLogHomeSyncReentry(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;
  try {
    return window.localStorage.getItem("samarket:debug:homeSyncReentry") === "1";
  } catch {
    return false;
  }
}

export function logHomeSyncReentry(payload: Record<string, unknown>): void {
  if (!shouldLogHomeSyncReentry()) return;
  // eslint-disable-next-line no-console -- dev / opt-in localStorage 진단
  console.info("[home-sync-reentry]", payload);
}
