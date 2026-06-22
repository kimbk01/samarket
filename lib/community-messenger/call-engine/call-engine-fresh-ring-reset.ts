"use client";

import {
  clearCallEngineCompletedActions,
  clearCallEngineLocks,
  clearCallEngineTerminalConsumed,
  isCallEngineTerminalConsumed,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import { clearCallEngineState, getCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import { readCallConsumedReason, resetDibayCallSessionState } from "@/lib/community-messenger/incoming-call-state";

const TERMINAL_CONSUMED_REASONS = new Set([
  "declined",
  "missed",
  "ended",
  "rejected",
  "cancelled",
]);

const POST_ACCEPT_PHASES = new Set(["accepting", "joining", "connected"]);

/**
 * 서버가 다시 `ringing` 인데 로컬 terminal/accepted latch 가 남아 2회차 수신·수락이 막힐 때 해제.
 * (1회 취소 후 dialFresh 재발신·동일 callId 재사용 등)
 */
export function prepareCallEngineForFreshIncomingRing(callId: string): boolean {
  const sid = callId.trim();
  if (!sid) return false;
  const consumed = readCallConsumedReason(sid);
  const latched = isCallEngineTerminalConsumed(sid);
  const phase = getCallEngineState(sid);
  const shouldReset =
    latched ||
    (consumed != null && TERMINAL_CONSUMED_REASONS.has(consumed)) ||
    (consumed === "accepted" && !POST_ACCEPT_PHASES.has(phase));
  if (!shouldReset) return false;

  resetDibayCallSessionState(sid);
  clearCallEngineLocks(sid);
  clearCallEngineTerminalConsumed(sid);
  clearCallEngineCompletedActions(sid);
  clearCallEngineState(sid);
  return true;
}
