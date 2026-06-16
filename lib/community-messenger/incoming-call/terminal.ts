"use client";

import type { CallConsumedReason } from "@/lib/community-messenger/incoming-call/tombstone";
import { latchIncomingCallTerminal } from "@/lib/community-messenger/incoming-call/tombstone";
import { stopIncomingCallRing } from "@/lib/community-messenger/incoming-call/ring-owner";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";

/** 종료 latch + 벨 즉시 중지 — terminal 핸들러 최상단에서 호출 */
export function sealIncomingCallTerminal(
  callId: string | null | undefined,
  reason: CallConsumedReason,
  hardClearedAt: Map<string, number>,
  source: string
): string {
  const sid = callId?.trim() ?? "";
  stopIncomingCallRing("terminal_event", sid || null);
  if (!sid) return "";
  latchIncomingCallTerminal(sid, reason, hardClearedAt);
  logDibayCall("terminal_received", { sessionId: sid, callId: sid, reason, source });
  return sid;
}
