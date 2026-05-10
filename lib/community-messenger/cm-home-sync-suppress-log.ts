"use client";

/**
 * silent home-sync 재생·suppress 진단 — `[home-sync-suppress]`
 * dev 기본 / `localStorage samarket:debug:homeSyncSuppress=1`
 */

export function shouldLogHomeSyncSuppress(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;
  try {
    return window.localStorage.getItem("samarket:debug:homeSyncSuppress") === "1";
  } catch {
    return false;
  }
}

export type HomeSyncSuppressReason =
  | "recent_success_replay"
  | "route_transition_stabilize"
  | "pathname_roundtrip";

export function logHomeSyncSuppress(payload: {
  suppressed: boolean;
  reason: HomeSyncSuppressReason;
  age_ms: number;
  pathname: string;
  previous_pathname: string;
  reused_snapshot: boolean;
  cooldown_ms: number;
  tier: "critical" | "full";
}): void {
  if (!shouldLogHomeSyncSuppress()) return;
  // eslint-disable-next-line no-console -- dev / opt-in 진단
  console.warn("[home-sync-suppress]", payload);
}
