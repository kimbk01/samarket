"use client";

import { cmDevHmrFlags } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import { getRoomTapT0, msSinceRoomTap } from "@/lib/community-messenger/room/cm-room-entry-timing";

let routeTransitionStartedAt = 0;
let longtaskOverlapMs = 0;

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function noteCmRoomRouteTransitionStart(): void {
  routeTransitionStartedAt = perfNow();
}

export function resetCmDevNoiseImpactSession(): void {
  routeTransitionStartedAt = 0;
  longtaskOverlapMs = 0;
}

export function noteCmDevLongtaskDuringRoomEntry(durationMs: number, startTime: number): void {
  const tap = getRoomTapT0();
  if (tap <= 0 || durationMs < 50) return;
  const entryEnd = tap + 3000;
  if (startTime < tap || startTime > entryEnd) return;
  longtaskOverlapMs += durationMs;
}

export function emitCmDevNoiseImpact(roomId: string): void {
  if (process.env.NODE_ENV !== "development") return;
  const tap = getRoomTapT0();
  if (tap <= 0) return;
  const hmr = cmDevHmrFlags();
  const now = perfNow();
  const routeOverlapMs =
    routeTransitionStartedAt > 0
      ? Math.round(Math.max(0, now - Math.max(routeTransitionStartedAt, tap)))
      : null;
  const tapMs = msSinceRoomTap();
  const estimatedProdDeltaMs = Math.max(
    0,
    Math.round(longtaskOverlapMs * 0.12 + (hmr.dev_hmr_active ? 40 : 0) + (hmr.vite_or_next_overlay_active ? 25 : 0))
  );
  // eslint-disable-next-line no-console -- dev-only HMR/route noise estimate
  console.log("[cm-dev-noise-impact]", {
    roomId: String(roomId ?? "").trim(),
    hmr_active: hmr.dev_hmr_active,
    overlay_active: hmr.vite_or_next_overlay_active,
    longtask_overlap_ms: Math.round(longtaskOverlapMs),
    route_transition_overlap_ms: routeOverlapMs,
    tap_ms: tapMs,
    estimated_prod_delta_ms: estimatedProdDeltaMs,
  });
  resetCmDevNoiseImpactSession();
}
