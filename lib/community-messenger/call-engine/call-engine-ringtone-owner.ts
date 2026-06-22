"use client";

import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  stopIncomingCallRing,
  syncIncomingCallRing,
} from "@/lib/community-messenger/incoming-call/ring-owner";
import {
  isCallEngineTerminalConsumed,
  tryLockCallEngineRingtoneOwnerOnce,
} from "@/lib/community-messenger/call-engine/call-engine-locks";

export function startCallEngineIncomingRingtone(args: {
  callId: string;
  callKind: CommunityMessengerCallKind;
  hardClearedAt: Map<string, number>;
  source: string;
}): boolean {
  const sid = args.callId.trim();
  if (!sid || isCallEngineTerminalConsumed(sid)) return false;
  if (!tryLockCallEngineRingtoneOwnerOnce(sid)) return false;
  syncIncomingCallRing({
    sessionId: sid,
    callKind: args.callKind,
    hardClearedAt: args.hardClearedAt,
    source: args.source,
  });
  return true;
}

export function stopCallEngineIncomingRingtone(callId: string, reason: string): void {
  const sid = callId.trim();
  if (!sid) return;
  stopIncomingCallRing(reason, sid);
}
