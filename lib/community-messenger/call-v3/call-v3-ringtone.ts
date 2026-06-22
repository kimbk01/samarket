"use client";

import {
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallTone,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
  type CallToneController,
} from "@/lib/community-messenger/call-feedback-sound";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

let activeRingCallId: string | null = null;
let activeTone: CallToneController | null = null;

export function readCallV3ActiveRingtoneCallId(): string | null {
  return activeRingCallId;
}

export function startCallV3Ringtone(callId: string, callKind: CommunityMessengerCallKind): void {
  const sid = callId.trim();
  if (!sid || activeRingCallId === sid) return;

  stopCallV3Ringtone("replace");
  activeRingCallId = sid;
  logCallV3("ringtone_start", { callId: sid, callKind });
  unlockCommunityMessengerCallPlaybackFromUserGesture();

  void startCommunityMessengerCallTone("incoming", { callKind }).then((tone) => {
    if (activeRingCallId !== sid) {
      tone.stop();
      return;
    }
    activeTone = tone;
  });
}

export function stopCallV3Ringtone(reason = "v3_stop"): void {
  const sid = activeRingCallId;
  activeRingCallId = null;
  activeTone?.stop();
  activeTone = null;
  stopCommunityMessengerCallTone();
  if (sid) {
    logCallV3("ringtone_stop", { callId: sid, reason });
  }
}

export function resetCallV3RingtoneForTests(): void {
  activeRingCallId = null;
  activeTone = null;
}
