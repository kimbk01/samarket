"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  stopIncomingCallRing,
  syncIncomingCallRing,
} from "@/lib/community-messenger/incoming-call/ring-owner";
import {
  startOutgoingRingback,
  stopOutgoingRingback,
  stopAllOutgoingRingback,
} from "@/lib/community-messenger/call-outgoing-ringback-controller";
import {
  isCallEngineTerminalConsumed,
  isCallEngineRingbackOwner,
  tryLockCallEngineRingbackOwnerOnce,
  tryLockCallEngineRingtoneOwnerOnce,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import { getCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import { logSoundState } from "@/lib/community-messenger/call-engine/call-engine-audit-log";

export function startCallEngineIncomingRingtone(args: {
  callId: string;
  callKind: CommunityMessengerCallKind;
  hardClearedAt: Map<string, number>;
  source: string;
}): boolean {
  const sid = args.callId.trim();
  if (!sid || isCallEngineTerminalConsumed(sid)) {
    logSoundState({
      callId: sid,
      phase: getCallEngineState(sid),
      ringtoneOwner: false,
      ringbackOwner: false,
      action: "skip",
      reason: "terminal_consumed",
    });
    return false;
  }
  if (!tryLockCallEngineRingtoneOwnerOnce(sid)) {
    logSoundState({
      callId: sid,
      phase: getCallEngineState(sid),
      ringtoneOwner: true,
      ringbackOwner: isCallEngineRingbackOwner(sid),
      action: "skip",
      reason: "ringtone_owner_held",
    });
    return false;
  }
  syncIncomingCallRing({
    sessionId: sid,
    callKind: args.callKind,
    hardClearedAt: args.hardClearedAt,
    source: args.source,
  });
  logSoundState({
    callId: sid,
    phase: getCallEngineState(sid),
    ringtoneOwner: true,
    ringbackOwner: isCallEngineRingbackOwner(sid),
    action: "start",
    reason: args.source,
  });
  return true;
}

export function stopCallEngineIncomingRingtone(callId: string, reason: string): void {
  const sid = callId.trim();
  if (!sid) return;
  stopIncomingCallRing(reason, sid);
  logSoundState({
    callId: sid,
    phase: getCallEngineState(sid),
    ringtoneOwner: false,
    ringbackOwner: isCallEngineRingbackOwner(sid),
    action: "stop",
    reason,
  });
}

export function startCallEngineOutgoingRingback(args: {
  callId: string;
  kind: CommunityMessengerCallKind;
  source: string;
}): boolean {
  const sid = args.callId.trim();
  if (!sid || isCallEngineTerminalConsumed(sid)) return false;
  if (!tryLockCallEngineRingbackOwnerOnce(sid)) return false;
  startOutgoingRingback({ callId: sid, kind: args.kind, source: args.source });
  return true;
}

export function stopCallEngineOutgoingRingback(callId: string | null | undefined, reason: string): void {
  const sid = callId?.trim() ?? "";
  if (sid) {
    stopOutgoingRingback(sid, reason);
    return;
  }
  stopAllOutgoingRingback(reason);
}
