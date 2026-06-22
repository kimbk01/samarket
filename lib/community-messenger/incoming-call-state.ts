import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { logDibayCall } from "@/lib/community-messenger/call-orchestrator";
import { syncDibayCallConsumedToNative } from "@/lib/push/native/dibay-call-consumed-native-bridge";
import { isCallEngineTerminalConsumed, markCallEngineTerminalConsumed } from "@/lib/community-messenger/call-engine/call-engine-locks";

export const INCOMING_USER_DISMISSED_KEEP_MS = 120_000;
export const INCOMING_REMOTE_HARD_CLEAR_KEEP_MS = 120_000;
/** accept/decline/missed/ended 후 동일 callId 재수신 금지 TTL */
export const INCOMING_CALL_CONSUMED_KEEP_MS = 120_000;

export type CallSessionPhase =
  | "incoming"
  | "accepting"
  | "connecting"
  | "active"
  | "declined"
  | "missed"
  | "ended"
  | "consumed";

export type CallConsumedReason =
  | "accepted"
  | "declined"
  | "missed"
  | "ended"
  | "rejected"
  | "cancelled";

type PhaseEntry = {
  phase: CallSessionPhase;
  reason?: CallConsumedReason;
  at: number;
};

const phaseByCallId = new Map<string, PhaseEntry>();
const consumedByCallId = new Map<string, { reason: CallConsumedReason; at: number }>();

function normalizeCallId(callId: string | null | undefined): string {
  return callId?.trim() ?? "";
}

function pruneConsumedRuntime(now: number): void {
  for (const [id, entry] of [...consumedByCallId.entries()]) {
    if (now - entry.at > INCOMING_CALL_CONSUMED_KEEP_MS) {
      consumedByCallId.delete(id);
      const phase = phaseByCallId.get(id);
      if (phase?.phase === "consumed") {
        phaseByCallId.delete(id);
      }
    }
  }
}

function prunePhaseRuntime(now: number): void {
  for (const [id, entry] of [...phaseByCallId.entries()]) {
    if (entry.phase === "consumed") continue;
    if (now - entry.at > INCOMING_CALL_CONSUMED_KEEP_MS) {
      phaseByCallId.delete(id);
    }
  }
}

export function getDibayCallSessionPhase(callId: string | null | undefined, now = Date.now()): CallSessionPhase | null {
  pruneConsumedRuntime(now);
  prunePhaseRuntime(now);
  const sid = normalizeCallId(callId);
  if (!sid) return null;
  if (consumedByCallId.has(sid)) return "consumed";
  return phaseByCallId.get(sid)?.phase ?? null;
}

export function setDibayCallSessionPhase(
  callId: string | null | undefined,
  phase: CallSessionPhase,
  reason?: CallConsumedReason,
  now = Date.now()
): void {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  if (phase === "consumed") {
    markCallConsumed(sid, reason ?? "ended", now);
    return;
  }
  if (isDibayCallConsumed(sid, now)) return;
  phaseByCallId.set(sid, { phase, reason, at: now });
}

export function markCallConsumed(
  callId: string | null | undefined,
  reason: CallConsumedReason,
  now = Date.now()
): void {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  if (reason !== "accepted") {
    markCallEngineTerminalConsumed(sid);
  }
  consumedByCallId.set(sid, { reason, at: now });
  phaseByCallId.set(sid, { phase: "consumed", reason, at: now });
  logDibayCall("incoming_consumed", { sessionId: sid, callId: sid, reason, source: "mark_call_consumed" });
  syncDibayCallConsumedToNative(sid, reason);
}

/** Native tombstone hydrate — does not write back to native store (avoids loop). */
export function markCallConsumedFromNativeHydrate(
  callId: string | null | undefined,
  reason: CallConsumedReason,
  now = Date.now()
): void {
  const sid = normalizeCallId(callId);
  if (!sid) return;
  if (consumedByCallId.has(sid)) return;
  consumedByCallId.set(sid, { reason, at: now });
  phaseByCallId.set(sid, { phase: "consumed", reason, at: now });
  logDibayCall("incoming_consumed", { sessionId: sid, callId: sid, reason, source: "native_hydrate" });
}

export function isDibayCallConsumed(callId: string | null | undefined, now = Date.now()): boolean {
  pruneConsumedRuntime(now);
  const sid = normalizeCallId(callId);
  if (!sid) return false;
  if (isCallEngineTerminalConsumed(sid)) return true;
  return consumedByCallId.has(sid);
}

export function readCallConsumedReason(
  callId: string | null | undefined,
  now = Date.now(),
): CallConsumedReason | null {
  pruneConsumedRuntime(now);
  const sid = normalizeCallId(callId);
  if (!sid) return null;
  return consumedByCallId.get(sid)?.reason ?? null;
}

/** ringtone 은 phase === incoming 일 때만 허용 */
export function shouldAllowIncomingRingtone(callId: string | null | undefined, now = Date.now()): boolean {
  if (isDibayCallConsumed(callId, now)) return false;
  const phase = getDibayCallSessionPhase(callId, now);
  if (phase == null) return true;
  return phase === "incoming";
}

export function filterIncomingSessionsRespectingConsumed(
  list: CommunityMessengerCallSession[],
  now = Date.now()
): CommunityMessengerCallSession[] {
  pruneConsumedRuntime(now);
  return list.filter((s) => !isDibayCallConsumed(s.id, now));
}

export function resetDibayCallSessionState(callId?: string | null): void {
  if (callId) {
    const sid = normalizeCallId(callId);
    if (!sid) return;
    phaseByCallId.delete(sid);
    consumedByCallId.delete(sid);
    return;
  }
  phaseByCallId.clear();
  consumedByCallId.clear();
}

export function pruneDismissedIncomingSessionIds(dismissedAtBySessionId: Map<string, number>): void {
  const now = Date.now();
  for (const [id, at] of [...dismissedAtBySessionId.entries()]) {
    if (now - at > INCOMING_USER_DISMISSED_KEEP_MS) dismissedAtBySessionId.delete(id);
  }
}

function isUserDismissedIncomingSession(id: string, dismissedAtBySessionId: Map<string, number>, now: number): boolean {
  const at = dismissedAtBySessionId.get(id);
  return at != null && now - at <= INCOMING_USER_DISMISSED_KEEP_MS;
}

export function filterIncomingSessionsRespectingDismissed(
  list: CommunityMessengerCallSession[],
  dismissedAtBySessionId: Map<string, number>
): CommunityMessengerCallSession[] {
  const now = Date.now();
  pruneDismissedIncomingSessionIds(dismissedAtBySessionId);
  return list.filter((s) => !isUserDismissedIncomingSession(s.id, dismissedAtBySessionId, now));
}

export function pruneHardClearedIncomingSessionIds(hardClearedAtBySessionId: Map<string, number>): void {
  const now = Date.now();
  for (const [id, at] of [...hardClearedAtBySessionId.entries()]) {
    if (now - at > INCOMING_REMOTE_HARD_CLEAR_KEEP_MS) hardClearedAtBySessionId.delete(id);
  }
}

function isHardClearedIncomingSession(id: string, hardClearedAtBySessionId: Map<string, number>, now: number): boolean {
  const at = hardClearedAtBySessionId.get(id);
  return at != null && now - at <= INCOMING_REMOTE_HARD_CLEAR_KEEP_MS;
}

export function isIncomingSessionHardCleared(
  sessionId: string,
  hardClearedAtBySessionId: Map<string, number>,
  now: number
): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  if (isDibayCallConsumed(sid, now)) return true;
  return isHardClearedIncomingSession(sid, hardClearedAtBySessionId, now);
}

export function filterIncomingSessionsRespectingHardClear(
  list: CommunityMessengerCallSession[],
  hardClearedAtBySessionId: Map<string, number>
): CommunityMessengerCallSession[] {
  const now = Date.now();
  pruneHardClearedIncomingSessionIds(hardClearedAtBySessionId);
  return list
    .filter((s) => !isHardClearedIncomingSession(s.id, hardClearedAtBySessionId, now))
    .filter((s) => !isDibayCallConsumed(s.id, now));
}
