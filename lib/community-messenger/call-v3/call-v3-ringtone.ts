"use client";

import {
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallTone,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
  type CallToneController,
} from "@/lib/community-messenger/call-feedback-sound";
import { getPrimedWebAudioCallToneContextState } from "@/lib/community-messenger/call-tone-web-audio";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import {
  startNativeIncomingRingtoneFireAndForget,
  stopNativeIncomingRingtoneFireAndForget,
} from "@/lib/push/native/dibay-call-consumed-native-bridge";
import { getSyncNativeIncomingCallPlugin } from "@/lib/push/native/push-route-native-bridge";

let activeRingCallId: string | null = null;
let activeTone: CallToneController | null = null;
let activeNativeRingCallId: string | null = null;

function useNativeIncomingRingOwner(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

function logRingtoneAudioContextState(callId: string): void {
  logCallV3("ringtone_audio_context_state", {
    callId,
    audioContextState: getPrimedWebAudioCallToneContextState(),
    nativeRingOwner: useNativeIncomingRingOwner(),
    nativePluginReady: Boolean(getSyncNativeIncomingCallPlugin()?.startIncomingRingtone),
  });
}

export function readCallV3ActiveRingtoneCallId(): string | null {
  return activeRingCallId;
}

export function startCallV3Ringtone(callId: string, callKind: CommunityMessengerCallKind): void {
  const sid = callId.trim();
  if (!sid || activeRingCallId === sid) return;

  stopCallV3Ringtone("replace");
  activeRingCallId = sid;

  logCallV3("ringtone_start_requested", { callId: sid, callKind });
  logRingtoneAudioContextState(sid);

  if (useNativeIncomingRingOwner()) {
    const plugin = getSyncNativeIncomingCallPlugin();
    if (!plugin?.startIncomingRingtone) {
      logCallV3("ringtone_start_failed", {
        callId: sid,
        callKind,
        path: "native_android",
        reason: "native_plugin_unavailable",
      });
      return;
    }
    startNativeIncomingRingtoneFireAndForget(sid);
    activeNativeRingCallId = sid;
    logCallV3("ringtone_start_success", {
      callId: sid,
      callKind,
      path: "native_android",
    });
    return;
  }

  unlockCommunityMessengerCallPlaybackFromUserGesture();

  void startCommunityMessengerCallTone("incoming", { callKind })
    .then((tone) => {
      logCallV3("ringtone_start_result", {
        callId: sid,
        callKind,
        path: "web",
        hasController: Boolean(tone),
      });
      if (activeRingCallId !== sid) {
        tone.stop();
        logCallV3("ringtone_stop", { callId: sid, reason: "stale_web_tone" });
        return;
      }
      activeTone = tone;
      logCallV3("ringtone_start_success", {
        callId: sid,
        callKind,
        path: "web",
        audioContextState: getPrimedWebAudioCallToneContextState(),
      });
    })
    .catch((error: unknown) => {
      logCallV3("ringtone_start_failed", {
        callId: sid,
        callKind,
        path: "web",
        reason: error instanceof Error ? error.message : String(error),
        audioContextState: getPrimedWebAudioCallToneContextState(),
      });
    });
}

export function stopCallV3Ringtone(reason = "v3_stop"): void {
  const sid = activeRingCallId;
  const nativeSid = activeNativeRingCallId;
  activeRingCallId = null;
  activeNativeRingCallId = null;
  activeTone?.stop();
  activeTone = null;
  stopCommunityMessengerCallTone();
  if (nativeSid) {
    stopNativeIncomingRingtoneFireAndForget(nativeSid);
  }
  if (sid) {
    logCallV3("ringtone_stop", { callId: sid, reason, hadNativeRing: Boolean(nativeSid) });
  }
}

export function resetCallV3RingtoneForTests(): void {
  activeRingCallId = null;
  activeNativeRingCallId = null;
  activeTone = null;
}
