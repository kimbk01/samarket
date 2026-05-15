"use client";

import {
  assertCmRoomTimingEmit,
  getActiveCmRoomEntrySessionId,
  getCmRoomEntrySessionTapT0,
  getActiveCmRoomEntrySessionRoomId,
  markCmRoomTimingMetricRecorded,
} from "@/lib/community-messenger/room/cm-room-entry-timing-session";
import {
  finalizeCmRoomEntryComposerFrameVisibleMs,
  finalizeCmRoomEntryShellVisibleMs,
} from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { recordRoomEntryStage } from "@/lib/community-messenger/room/cm-room-entry-timing";
import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import { cmMessengerPerfVerboseLog } from "@/lib/community-messenger/room/cm-messenger-perf-verbose-log";

let preRouteShellFinalLogged = false;

function msSinceTap(at: number): number | null {
  const tap = getCmRoomEntrySessionTapT0();
  if (tap <= 0 || at <= 0) return null;
  return Math.round(at - tap);
}

function buildPreRouteShellPayload(): Record<string, unknown> | null {
  const s = useCmRoomOpeningOverlayStore.getState();
  const roomId = getActiveCmRoomEntrySessionRoomId() || s.openingRoomId;
  if (!roomId || s.shellVisibleAt <= 0) return null;
  return {
    roomId,
    sessionId: getActiveCmRoomEntrySessionId() || null,
    overlay_visible_ms: msSinceTap(s.shellVisibleAt),
    route_transition_started_ms:
      s.routeTransitionStartedAt > 0 ? msSinceTap(s.routeTransitionStartedAt) : null,
    route_mounted_ms: s.routeMountedAt > 0 ? msSinceTap(s.routeMountedAt) : null,
    hydration_complete_ms: s.hydrationCompleteAt > 0 ? msSinceTap(s.hydrationCompleteAt) : null,
    handoff_ms: s.handoffAt > 0 ? msSinceTap(s.handoffAt) : null,
  };
}

/** PRE-ROUTE overlay 첫 paint — shell_visible_ms 기준(<80ms 목표). */
export function emitCmPreRouteShellOverlayVisibleLog(): void {
  const payload = buildPreRouteShellPayload();
  if (!payload) return;
  const roomId = String(payload.roomId ?? "").trim();
  const session = assertCmRoomTimingEmit({ roomId, metric: "pre_route_shell" });
  if (!session) return;
  markCmRoomTimingMetricRecorded("pre_route_shell");
  recordRoomEntryStage("shell");
  finalizeCmRoomEntryShellVisibleMs(roomId, true);
  finalizeCmRoomEntryComposerFrameVisibleMs(roomId, true);
  cmMessengerPerfVerboseLog("[cm-pre-route-shell]", payload);
}

export function tryEmitCmPreRouteShellFinalLog(): void {
  if (preRouteShellFinalLogged) return;
  const s = useCmRoomOpeningOverlayStore.getState();
  if (!s.openingRoomId || s.shellVisibleAt <= 0 || s.handoffAt <= 0) return;
  const payload = buildPreRouteShellPayload();
  if (!payload) return;
  const roomId = String(payload.roomId ?? "").trim();
  if (!getActiveCmRoomEntrySessionRoomId() || getActiveCmRoomEntrySessionRoomId() !== roomId) return;
  preRouteShellFinalLogged = true;
  cmMessengerPerfVerboseLog("[cm-pre-route-shell]", payload);
}

export function resetCmPreRouteShellInstrumentationForTests(): void {
  preRouteShellFinalLogged = false;
}
