"use client";

/**
 * silent home-sync 재생·suppress 진단 — `[home-sync-suppress]`
 * `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` 또는 `localStorage samarket:debug:homeSyncSuppress=1`
 */

export function shouldLogHomeSyncSuppress(): boolean {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE === "1") return true;
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
  // eslint-disable-next-line no-console -- gated suppress diagnostic
  console.debug("[home-sync-suppress]", payload);
}
