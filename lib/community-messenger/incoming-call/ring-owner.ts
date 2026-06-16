"use client";

/**
 * 수신 벨 단일 소유 — Web 브라우저 또는 Android Native (Capacitor APK).
 * 동일 callId 재시작 금지. tombstone 이후 start 무시.
 */
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { playIncomingCallRingtone, stopCallRingtone } from "@/lib/community-messenger/call-ringtone-controller";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { setDibayCallSessionPhase } from "@/lib/community-messenger/incoming-call-state";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import { stopNativeIncomingRingtoneFireAndForget } from "@/lib/push/native/dibay-call-consumed-native-bridge";
import { canIncomingCallRing } from "@/lib/community-messenger/incoming-call/tombstone";

export type IncomingRingSyncCandidate = {
  sessionId: string;
  callKind: CommunityMessengerCallKind;
  hardClearedAt: Map<string, number>;
  source?: string;
};

let activeRingCallId: string | null = null;

function useNativeRingOwner(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

function stopWebRing(reason: string, sessionId?: string | null): void {
  stopCallRingtone(reason, sessionId);
}

function stopNativeRing(sessionId?: string | null): void {
  if (!useNativeRingOwner()) return;
  stopNativeIncomingRingtoneFireAndForget(sessionId);
}

/** 즉시 벨 중지 — terminal·reject·sync(null) 공통 */
export function stopIncomingCallRing(reason: string, callId?: string | null): void {
  const sid = callId?.trim() ?? "";
  if (sid && activeRingCallId === sid) {
    activeRingCallId = null;
  } else if (!sid) {
    activeRingCallId = null;
  }
  stopWebRing(reason, sid || undefined);
  stopNativeRing(sid || undefined);
  if (sid) {
    logDibayCall("ring_stop", { sessionId: sid, callId: sid, reason, source: "ring_owner" });
  }
}

/**
 * 현재 유일한 ringing 세션과 동기화.
 * - null → 벨 끔
 * - 동일 callId → 재시작 안 함 (종료 후 한 번 더 울림 방지)
 * - Android APK → WebAudio 금지, native FCM/RingOwner 가 벨 담당
 */
export function syncIncomingCallRing(candidate: IncomingRingSyncCandidate | null): void {
  if (!candidate) {
    if (activeRingCallId) {
      stopIncomingCallRing("sync_clear", activeRingCallId);
    } else if (useNativeRingOwner()) {
      // Native OS ring is not tracked by activeRingCallId — still stop on clear.
      stopNativeRing(null);
    }
    return;
  }

  const sid = candidate.sessionId.trim();
  const source = candidate.source ?? "sync";
  if (!sid) {
    syncIncomingCallRing(null);
    return;
  }

  if (!canIncomingCallRing(sid, candidate.hardClearedAt)) {
    // Android native ring can outlive Web activeRingCallId — always stop both lanes.
    stopIncomingCallRing("tombstone", sid);
    logDibayCall("incoming_ignored_consumed", { sessionId: sid, callId: sid, source });
    return;
  }

  if (activeRingCallId === sid) {
    return;
  }

  if (activeRingCallId) {
    stopIncomingCallRing("sync_replace", activeRingCallId);
  }

  activeRingCallId = sid;
  setDibayCallSessionPhase(sid, "incoming");

  if (useNativeRingOwner()) {
    logDibayCall("ring_start_skipped_native_owner", {
      sessionId: sid,
      callId: sid,
      callKind: candidate.callKind,
      source,
    });
    return;
  }

  unlockCommunityMessengerCallPlaybackFromUserGesture();
  playIncomingCallRingtone(sid, candidate.callKind);
  logDibayCall("ring_start", { sessionId: sid, callId: sid, callKind: candidate.callKind, source });
}

export function resetIncomingCallRingOwner(): void {
  activeRingCallId = null;
  stopWebRing("reset");
  stopNativeRing(null);
}
