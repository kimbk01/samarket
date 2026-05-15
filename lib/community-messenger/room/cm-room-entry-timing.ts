"use client";

import {
  emitCmDevNoiseImpact,
  resetCmDevNoiseImpactSession,
} from "@/lib/community-messenger/dev/cm-dev-noise-impact";
import { resetCmRoomPassInstrumentationForTests } from "@/lib/community-messenger/room/cm-room-pass-instrumentation";
import { resetCmPreRouteShellInstrumentationForTests } from "@/lib/community-messenger/room/cm-pre-route-shell-instrumentation";
import { cmDevHmrFlags } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import {
  acquireCmRoomEntryTimingSession,
  clearCmRoomEntryTimingSession,
  freezeCmRoomEntryTimingSession,
  getActiveCmRoomEntrySessionId,
  getActiveCmRoomEntrySessionRoomId,
  getCmRoomEntrySessionTapT0,
  hasCmRoomEntryTimingSession,
  isCmRoomEntryTimingSessionActive,
  msSinceSessionTap,
  mutateCmRoomEntryTimingSession,
  resetCmRoomEntryTimingSessionForTests,
  CM_ROOM_ENTRY_TAP_TTL_MS,
} from "@/lib/community-messenger/room/cm-room-entry-timing-session";

export { CM_ROOM_ENTRY_TAP_TTL_MS as CM_ROOM_TAP_TTL_MS };
export const CM_ROOM_ENTRY_QUIET_WINDOW_MS = 500;

let routeT0RecordedAt = 0;
let usedRouteT0Fallback = false;

let quietWindowEnd = 0;
let quietDeferredTaskCount = 0;
let quietExecutedAfterResume = 0;
let quietWindowStartedLogged = false;
let quietWindowEndedLogged = false;

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function logQuietWindowStarted(): void {
  if (quietWindowStartedLogged || getCmRoomEntrySessionTapT0() <= 0) return;
  quietWindowStartedLogged = true;
  // eslint-disable-next-line no-console -- quiet window diagnostics
  console.log("[cm-room-entry-quiet-window]", {
    sessionId: getActiveCmRoomEntrySessionId(),
    started: true,
    ended: false,
    duration_ms: CM_ROOM_ENTRY_QUIET_WINDOW_MS,
    deferred_tasks: 0,
    executed_after_resume: 0,
  });
}

function logQuietWindowEnded(): void {
  if (quietWindowEndedLogged || getCmRoomEntrySessionTapT0() <= 0) return;
  quietWindowEndedLogged = true;
  // eslint-disable-next-line no-console -- quiet window diagnostics
  console.log("[cm-room-entry-quiet-window]", {
    sessionId: getActiveCmRoomEntrySessionId(),
    started: true,
    ended: true,
    duration_ms: CM_ROOM_ENTRY_QUIET_WINDOW_MS,
    deferred_tasks: quietDeferredTaskCount,
    executed_after_resume: quietExecutedAfterResume,
  });
}

export function markRoomTapAtClick(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id || typeof performance === "undefined") return;
  const { created } = acquireCmRoomEntryTimingSession(id, "nav_tap");
  routeT0RecordedAt = 0;
  usedRouteT0Fallback = false;
  const tapT0 = getCmRoomEntrySessionTapT0();
  quietWindowEnd = tapT0 + CM_ROOM_ENTRY_QUIET_WINDOW_MS;
  quietDeferredTaskCount = 0;
  quietExecutedAfterResume = 0;
  quietWindowStartedLogged = false;
  quietWindowEndedLogged = false;
  if (created) {
    resetCmDevNoiseImpactSession();
    resetCmRoomPassInstrumentationForTests();
    resetCmPreRouteShellInstrumentationForTests();
  }
  logQuietWindowStarted();
  window.setTimeout(() => {
    if (perfNow() >= quietWindowEnd) {
      logQuietWindowEnded();
    }
  }, CM_ROOM_ENTRY_QUIET_WINDOW_MS + 4);
}

export function noteRoomEntryRouteT0Fallback(): void {
  if (getCmRoomEntrySessionTapT0() > 0) return;
  if (typeof performance === "undefined") return;
  routeT0RecordedAt = perfNow();
  usedRouteT0Fallback = true;
  const roomId = getActiveCmRoomEntrySessionRoomId();
  if (roomId) {
    acquireCmRoomEntryTimingSession(roomId, "route_t0_fallback");
  }
  quietWindowEnd = getCmRoomEntrySessionTapT0() + CM_ROOM_ENTRY_QUIET_WINDOW_MS;
  logQuietWindowStarted();
}

export function getRoomTapT0(): number {
  return getCmRoomEntrySessionTapT0();
}

export function getRoomTapRoomId(): string {
  return getActiveCmRoomEntrySessionRoomId();
}

export function getRoomEntrySessionId(): string {
  return getActiveCmRoomEntrySessionId();
}

export function msSinceRoomTap(): number | null {
  return msSinceSessionTap();
}

export function entryTimingT0(): number {
  const tap = getCmRoomEntrySessionTapT0();
  if (tap > 0) return tap;
  if (typeof performance === "undefined") return 0;
  noteRoomEntryRouteT0Fallback();
  return getCmRoomEntrySessionTapT0();
}

export function recordRoomEntryStage(
  stage: "shell" | "header_seed" | "message_seed" | "message_viewport" | "composer"
): void {
  const roomId = getActiveCmRoomEntrySessionRoomId();
  if (!roomId || typeof performance === "undefined") return;
  if (!hasCmRoomEntryTimingSession(roomId)) return;

  const recorded = mutateCmRoomEntryTimingSession((session) => {
    if (session.frozen || session.stages[stage] > 0) return;
    const ms = msSinceSessionTap(session.sessionId);
    if (ms === null) return;
    session.stages[stage] = ms;
  });
  if (!recorded || recorded.stages[stage] <= 0) return;

  if (stage === "message_viewport") {
    freezeCmRoomEntryTimingSession("message_viewport");
    tryEmitRoomEntryStageLog();
    tryEmitRoomEntryTimingV2WhenReady();
  }
}

function roomEntryStageLogReady(stages: {
  shell: number;
  header_seed: number;
  message_seed: number;
  message_viewport: number;
  composer: number;
}): boolean {
  return stages.shell > 0 && stages.composer > 0 && stages.message_viewport > 0;
}

function roomEntryTimingV2Ready(stages: {
  shell: number;
  header_seed: number;
  message_seed: number;
  message_viewport: number;
  composer: number;
}): boolean {
  return (
    stages.shell > 0 &&
    stages.header_seed > 0 &&
    stages.composer > 0 &&
    stages.message_viewport > 0
  );
}

export function tryEmitRoomEntryTimingV2WhenReady(): void {
  const roomId = getActiveCmRoomEntrySessionRoomId();
  if (!roomId) return;
  const session = mutateCmRoomEntryTimingSession(() => {});
  if (!session || session.timingV2Emitted || !roomEntryTimingV2Ready(session.stages)) return;
  tryEmitRoomEntryTimingV2(roomId);
}

export function tryEmitRoomEntryStageLog(): void {
  const roomId = getActiveCmRoomEntrySessionRoomId();
  const sessionId = getActiveCmRoomEntrySessionId();
  if (!roomId || !sessionId) return;
  const session = mutateCmRoomEntryTimingSession((s) => {
    if (s.stageLogEmitted || !roomEntryStageLogReady(s.stages)) return;
    s.stageLogEmitted = true;
  });
  if (!session?.stageLogEmitted || !roomEntryStageLogReady(session.stages)) return;
  // eslint-disable-next-line no-console -- room entry stage diagnostics
  console.log("[cm-room-entry-stage]", {
    roomId,
    sessionId,
    shell_ms: session.stages.shell,
    header_seed_ms: session.stages.header_seed || null,
    message_seed_ms: session.stages.message_seed || null,
    message_viewport_ms: session.stages.message_viewport || null,
    composer_ms: session.stages.composer || null,
    network_waited: false,
  });
}

export function tryEmitRoomEntryTimingV2(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id || typeof performance === "undefined") return;
  const session = mutateCmRoomEntryTimingSession((s) => {
    if (s.timingV2Emitted || s.roomId !== id || !roomEntryTimingV2Ready(s.stages)) return;
    s.timingV2Emitted = true;
  });
  if (!session?.timingV2Emitted || session.roomId !== id) return;

  const hmr = cmDevHmrFlags();
  const tapT0 = session.tapT0;
  const routeT0AgeMs =
    routeT0RecordedAt > 0 && tapT0 > routeT0RecordedAt
      ? Math.round(tapT0 - routeT0RecordedAt)
      : usedRouteT0Fallback
        ? 0
        : null;
  // eslint-disable-next-line no-console -- room entry timing v2
  console.log("[cm-room-entry-timing-v2]", {
    roomId: id,
    sessionId: session.sessionId,
    roomTapT0_exists: true,
    routeT0_age_ms: routeT0AgeMs,
    tap_to_shell_ms: session.stages.shell || null,
    tap_to_seed_ms: session.stages.header_seed || session.stages.message_seed || null,
    tap_to_viewport_ms: session.stages.message_viewport || null,
    tap_to_message_viewport_ms: session.stages.message_viewport || null,
    tap_to_composer_ms: session.stages.composer || null,
    used_routeT0_fallback: usedRouteT0Fallback,
    dev_hmr_active: hmr.dev_hmr_active,
    vite_or_next_overlay_active: hmr.vite_or_next_overlay_active,
  });
  emitCmDevNoiseImpact(id);
}

export function isCmRoomEntryQuietWindowActive(): boolean {
  return typeof performance !== "undefined" && perfNow() < quietWindowEnd;
}

export function deferDuringRoomEntryQuietWindow(run: () => void): boolean {
  if (!isCmRoomEntryQuietWindowActive()) return false;
  quietDeferredTaskCount += 1;
  const delay = Math.max(0, Math.round(quietWindowEnd - perfNow()));
  window.setTimeout(() => {
    quietExecutedAfterResume += 1;
    try {
      run();
    } catch {
      /* ignore */
    }
    if (!isCmRoomEntryQuietWindowActive() && !quietWindowEndedLogged) {
      logQuietWindowEnded();
    }
  }, delay);
  return true;
}

export function resetRoomEntryTimingForTests(): void {
  routeT0RecordedAt = 0;
  usedRouteT0Fallback = false;
  quietWindowEnd = 0;
  quietDeferredTaskCount = 0;
  quietExecutedAfterResume = 0;
  quietWindowStartedLogged = false;
  quietWindowEndedLogged = false;
  resetCmRoomEntryTimingSessionForTests();
  resetCmRoomPassInstrumentationForTests();
  resetCmPreRouteShellInstrumentationForTests();
}

export {
  clearCmRoomEntryTimingSession,
  freezeCmRoomEntryTimingSession,
  markCmRoomEntryTimingExplicitClose,
} from "@/lib/community-messenger/room/cm-room-entry-timing-session";
