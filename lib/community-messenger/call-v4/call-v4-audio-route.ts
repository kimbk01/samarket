"use client";

import {
  applyCallAudioRoute,
  releaseNativeCallAudioRoute,
} from "@/lib/community-messenger/call-audio-route-controller";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { useCallV4MediaStore } from "@/lib/community-messenger/call-v4/call-v4-media-state";
import { readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Direction, CallV4MediaType } from "@/lib/community-messenger/call-v4/call-v4-types";

type CallV4AudioRouteSession = {
  callId: string;
  mediaType: CallV4MediaType;
  role: "caller" | "callee";
  userPreferredSpeaker: boolean | null;
};

let activeSession: CallV4AudioRouteSession | null = null;
const routeAppliedCallIds = new Set<string>();

function toCallType(mediaType: CallV4MediaType): "audio" | "video" {
  return mediaType === "video" ? "video" : "audio";
}

function toCallRole(direction: CallV4Direction): "caller" | "callee" {
  return direction === "outgoing" ? "caller" : "callee";
}

export function defaultSpeakerForCallV4MediaType(mediaType: CallV4MediaType): boolean {
  return mediaType === "video";
}

function syncSpeakerUi(desiredSpeaker: boolean): void {
  useCallV4MediaStore.getState().setSpeakerEnabled(desiredSpeaker);
}

async function applyRoute(reason: string, desiredSpeaker: boolean): Promise<void> {
  const session = activeSession;
  if (!session) return;
  if (readCallV4Phase() !== "connected") {
    logCallV4("audio_route_apply_skipped_not_connected", {
      callId: session.callId,
      reason,
      phase: readCallV4Phase(),
    });
    return;
  }
  try {
    await applyCallAudioRoute({
      callId: session.callId,
      callType: toCallType(session.mediaType),
      role: session.role,
      desiredSpeaker,
      reason,
    });
    syncSpeakerUi(desiredSpeaker);
    logCallV4("audio_route_apply_done", {
      callId: session.callId,
      reason,
      desiredSpeaker,
      mediaType: session.mediaType,
    });
  } catch (error) {
    logCallV4("audio_route_apply_failed", {
      callId: session.callId,
      reason,
      desiredSpeaker,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Apply speaker/earpiece route only after Connected Gate SSOT pass.
 * `connectedAt` is set exclusively by `markCallV4MediaConnected` on gate pass.
 */
export function ensureCallV4AudioRouteAfterConnectedGate(input: {
  callId: string;
  mediaType: CallV4MediaType;
  direction: CallV4Direction;
  connectedAt: number | null;
}): void {
  const sid = input.callId.trim();
  if (!sid) return;
  if (input.connectedAt == null) {
    logCallV4("audio_route_apply_skipped_pre_connected_gate", { callId: sid });
    return;
  }
  if (readCallV4Phase() !== "connected") return;

  const role = toCallRole(input.direction);
  const defaultSpeaker = defaultSpeakerForCallV4MediaType(input.mediaType);

  if (!activeSession || activeSession.callId !== sid) {
    activeSession = {
      callId: sid,
      mediaType: input.mediaType,
      role,
      userPreferredSpeaker: null,
    };
    syncSpeakerUi(defaultSpeaker);
  } else if (activeSession.mediaType !== input.mediaType) {
    activeSession.mediaType = input.mediaType;
    activeSession.userPreferredSpeaker = null;
    syncSpeakerUi(defaultSpeaker);
  }

  if (routeAppliedCallIds.has(sid)) return;
  routeAppliedCallIds.add(sid);
  void applyRoute("v4_connected_gate_pass", defaultSpeaker);
}

export async function toggleCallV4SpeakerRoute(callId: string): Promise<void> {
  const sid = callId.trim();
  if (!sid || readCallV4Phase() !== "connected") return;
  if (!activeSession || activeSession.callId !== sid) return;
  if (!routeAppliedCallIds.has(sid)) return;

  const currentSpeakerEnabled = useCallV4MediaStore.getState().speakerEnabled;
  const nextSpeakerEnabled = !currentSpeakerEnabled;
  activeSession.userPreferredSpeaker = nextSpeakerEnabled;
  await applyRoute("v4_speaker_toggle", nextSpeakerEnabled);
}

export async function releaseCallV4AudioRoute(callId: string, reason = "v4_cleanup"): Promise<void> {
  const sid = callId.trim();
  if (activeSession?.callId === sid) {
    activeSession = null;
  }
  routeAppliedCallIds.delete(sid);
  try {
    await releaseNativeCallAudioRoute(reason);
    logCallV4("audio_route_release", { callId: sid, reason });
  } catch (error) {
    logCallV4("audio_route_release_failed", {
      callId: sid,
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function resetCallV4AudioRouteLifecycleForTests(): void {
  activeSession = null;
  routeAppliedCallIds.clear();
}
