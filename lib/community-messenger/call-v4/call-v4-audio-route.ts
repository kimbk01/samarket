"use client";

import type { CallV4Direction, CallV4MediaType } from "@/lib/community-messenger/call-v4/call-v4-types";
import { useCallV4MediaStore } from "@/lib/community-messenger/call-v4/call-v4-media-state";
import type { DibayCallAudioRouteResult } from "@/lib/community-messenger/native-call-audio-route.client";

type CallV4AudioRouteSession = {
  callId: string;
  mediaType: CallV4MediaType;
  role: "caller" | "callee";
  userPreferredSpeaker: boolean | null;
  lastExternalConnected: boolean;
};

let activeSession: CallV4AudioRouteSession | null = null;
let unsubscribeRouteChanged: (() => void) | null = null;

type CallAudioRouteControllerModule = typeof import("@/lib/community-messenger/call-audio-route-controller");

async function loadCallAudioRouteController(): Promise<CallAudioRouteControllerModule> {
  return import("@/lib/community-messenger/call-audio-route-controller");
}

function toCallType(mediaType: CallV4MediaType): "audio" | "video" {
  return mediaType === "video" ? "video" : "audio";
}

function toCallRole(direction: CallV4Direction): "caller" | "callee" {
  return direction === "outgoing" ? "caller" : "callee";
}

function defaultSpeakerFor(mediaType: CallV4MediaType): boolean {
  return mediaType === "video";
}

function syncSpeakerUi(result: DibayCallAudioRouteResult, fallbackSpeaker: boolean): void {
  if (result.externalDeviceConnected) {
    useCallV4MediaStore.getState().setSpeakerEnabled(false);
    return;
  }
  if (result.actualRoute === "speaker") {
    useCallV4MediaStore.getState().setSpeakerEnabled(true);
    return;
  }
  if (result.actualRoute === "earpiece") {
    useCallV4MediaStore.getState().setSpeakerEnabled(false);
    return;
  }
  useCallV4MediaStore.getState().setSpeakerEnabled(fallbackSpeaker);
}

async function applyRoute(reason: string, desiredSpeaker: boolean): Promise<DibayCallAudioRouteResult | null> {
  const session = activeSession;
  if (!session) return null;
  const controller = await loadCallAudioRouteController();
  const result = await controller.applyCallAudioRoute({
    callId: session.callId,
    callType: toCallType(session.mediaType),
    role: session.role,
    desiredSpeaker,
    reason,
  });
  session.lastExternalConnected = result.externalDeviceConnected;
  syncSpeakerUi(result, desiredSpeaker);
  return result;
}

function attachRouteChangedListener(): void {
  unsubscribeRouteChanged?.();
  void loadCallAudioRouteController().then((controller) => {
    unsubscribeRouteChanged = controller.subscribeNativeCallAudioRouteChanged((result) => {
      const session = activeSession;
      if (!session) return;
      const hadExternal = session.lastExternalConnected;
      session.lastExternalConnected = result.externalDeviceConnected;
      syncSpeakerUi(result, defaultSpeakerFor(session.mediaType));
      if (hadExternal && !result.externalDeviceConnected) {
        session.userPreferredSpeaker = null;
        void applyRoute("v4_external_removed_fallback", defaultSpeakerFor(session.mediaType));
      }
    });
  });
}

export function ensureCallV4AudioRouteLifecycle(input: {
  callId: string;
  mediaType: CallV4MediaType;
  direction: CallV4Direction;
}): void {
  const sid = input.callId.trim();
  if (!sid) return;
  const role = toCallRole(input.direction);
  if (!activeSession || activeSession.callId !== sid) {
    activeSession = {
      callId: sid,
      mediaType: input.mediaType,
      role,
      userPreferredSpeaker: null,
      lastExternalConnected: false,
    };
    useCallV4MediaStore.getState().setSpeakerEnabled(defaultSpeakerFor(input.mediaType));
    attachRouteChangedListener();
    void applyRoute("v4_session_start", defaultSpeakerFor(input.mediaType));
    return;
  }
  if (activeSession.mediaType !== input.mediaType) {
    activeSession.mediaType = input.mediaType;
    activeSession.userPreferredSpeaker = null;
    useCallV4MediaStore.getState().setSpeakerEnabled(defaultSpeakerFor(input.mediaType));
    void applyRoute("v4_media_type_changed", defaultSpeakerFor(input.mediaType));
  }
}

export async function toggleCallV4SpeakerRoute(callId: string): Promise<void> {
  const sid = callId.trim();
  if (!activeSession || activeSession.callId !== sid) return;
  const currentSpeakerEnabled = useCallV4MediaStore.getState().speakerEnabled;
  const nextSpeakerEnabled = !currentSpeakerEnabled;
  activeSession.userPreferredSpeaker = nextSpeakerEnabled;
  await applyRoute("v4_speaker_toggle", nextSpeakerEnabled);
}

export async function releaseCallV4AudioRoute(callId: string, reason = "v4_cleanup"): Promise<void> {
  const sid = callId.trim();
  if (activeSession?.callId === sid) {
    activeSession = null;
    unsubscribeRouteChanged?.();
    unsubscribeRouteChanged = null;
  }
  const controller = await loadCallAudioRouteController();
  await controller.releaseNativeCallAudioRoute(reason);
}

export function resetCallV4AudioRouteLifecycleForTests(): void {
  activeSession = null;
  unsubscribeRouteChanged?.();
  unsubscribeRouteChanged = null;
}
