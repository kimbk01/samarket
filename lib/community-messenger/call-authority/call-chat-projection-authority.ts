/**
 * CUT 4 — Chat Call Projection SSOT
 *
 * CALL SESSION terminal truth → ONE call_stub projection.
 * Chat is never call authority.
 *
 * Canonical writer surface:
 *   updateCommunityMessengerCallSession
 *     → ensureTerminalCallStub / createCommunityMessengerCallLog
 *     → appendCommunityMessengerCallStubMessage
 *     → publishMessengerRoomBumpAfterMutation (CUT-1 parity with text send; projection only)
 *
 * Client local paths (IncomingCall / CallClient / peer_busy) may reconcile UI only;
 * they must not invent a second persisted stub.
 *
 * stub-message API = DEAD product caller (CUT9 cleanup). Preserve route.
 */

import {
  resolveCanonicalTerminalReason,
  type CanonicalTerminalReason,
} from "@/lib/community-messenger/call-authority/call-terminal-reason-authority";
import type { CallSessionResolvedEvent } from "@/lib/community-messenger/call-event-message";
import type { CommunityMessengerCallStatus } from "@/lib/community-messenger/types";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Stable DB idempotency — one stub per call session (not per actor/label). */
export function resolveCallStubIdempotencyKey(input: {
  sessionId?: string | null;
  tmpSessionId?: string | null;
  roomId?: string | null;
  createdAt?: string | null;
}): string {
  const sessionId = trimText(input.sessionId);
  if (sessionId) return `cm_call_stub:session:${sessionId}`;
  const tmp = trimText(input.tmpSessionId);
  if (tmp) return `cm_call_stub:tmp:${tmp}`;
  const roomId = trimText(input.roomId);
  const createdAt = trimText(input.createdAt);
  return `cm_call_stub:legacy:${roomId}:${createdAt}`;
}

/**
 * Map CUT3 canonical reason → chat resolved event (presentation input).
 * answered_elsewhere / busy without session are not session stub projections.
 */
export function mapCanonicalReasonToResolvedEvent(
  reason: CanonicalTerminalReason | null | undefined,
): CallSessionResolvedEvent | null {
  switch (reason) {
    case "caller_cancelled":
      return "cancelled_by_caller";
    case "callee_rejected":
      return "rejected_by_callee";
    case "missed_timeout":
      return "missed";
    case "ended_by_caller":
    case "ended_by_callee":
      return "ended";
    case "disconnected":
      return "disconnected";
    case "failed_setup":
    case "failed_network":
      return "failed";
    case "busy":
      return "peer_busy";
    case "answered_elsewhere":
      return null;
    case "superseded":
      // Wire status decides missed vs ended; default cancelled_by_caller is wrong for miss.
      return null;
    default:
      return null;
  }
}

/** Lifecycle callStatus stored on stub (compat with existing readers). */
export function mapCanonicalReasonToStoredCallStatus(
  reason: CanonicalTerminalReason | null | undefined,
  sessionStatus: string | null | undefined,
): CommunityMessengerCallStatus {
  const status = trimText(sessionStatus).toLowerCase();
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "missed" || status === "timeout") return "missed";
  if (reason === "callee_rejected") return "rejected";
  if (reason === "caller_cancelled") return "cancelled";
  if (reason === "missed_timeout" || reason === "superseded") {
    return status === "ended" ? "ended" : "missed";
  }
  return "ended";
}

export function resolveProjectionFromSession(input: {
  status: string | null | undefined;
  endedReason?: string | null;
  answeredAt?: string | null;
  terminalActorUserId?: string | null;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
}): {
  canonical: CanonicalTerminalReason | null;
  resolvedEvent: CallSessionResolvedEvent | null;
  callStatus: CommunityMessengerCallStatus;
} {
  const canonical = resolveCanonicalTerminalReason({
    status: input.status,
    endedReason: input.endedReason,
    answeredAt: input.answeredAt,
    terminalActorUserId: input.terminalActorUserId,
    initiatorUserId: input.initiatorUserId,
    recipientUserId: input.recipientUserId,
  });
  let resolvedEvent = mapCanonicalReasonToResolvedEvent(canonical);
  if (!resolvedEvent) {
    const status = trimText(input.status).toLowerCase();
    if (status === "rejected") resolvedEvent = "rejected_by_callee";
    else if (status === "cancelled") resolvedEvent = "cancelled_by_caller";
    else if (status === "missed" || status === "timeout") resolvedEvent = "missed";
    else if (status === "ended") {
      const er = trimText(input.endedReason).toLowerCase();
      if (er === "heartbeat_timeout" || er === "reconcile_stale_active") resolvedEvent = "disconnected";
      else if (er.startsWith("failed_")) resolvedEvent = er === "failed_network" && trimText(input.answeredAt) ? "disconnected" : "failed";
      else resolvedEvent = trimText(input.answeredAt) ? "ended" : "cancelled_by_caller";
    }
  }
  return {
    canonical,
    resolvedEvent,
    callStatus: mapCanonicalReasonToStoredCallStatus(canonical, input.status),
  };
}

/** Whether this terminal session should create/update a persisted call_stub. */
export function shouldPersistCallStubProjection(input: {
  sessionId?: string | null;
  roomId?: string | null;
  status?: string | null;
  canonical?: CanonicalTerminalReason | null;
}): boolean {
  if (!trimText(input.sessionId)) return false;
  if (!trimText(input.roomId)) return false;
  if (input.canonical === "answered_elsewhere") return false;
  if (input.canonical === "busy") return false;
  const status = trimText(input.status).toLowerCase();
  return status === "ended" || status === "rejected" || status === "missed" || status === "cancelled";
}

export type CallStubProjectionMetadata = {
  callKind: string;
  callStatus: CommunityMessengerCallStatus;
  sessionId: string | null;
  tmpSessionId?: string;
  durationSeconds: number | null;
  endedReason: string | null;
  canonicalReason: CanonicalTerminalReason | null;
  callResolvedEvent: CallSessionResolvedEvent | null;
  initiatorUserId: string | null;
  recipientUserId: string | null;
};

export function buildCallStubProjectionMetadata(input: {
  callKind: string;
  callStatus: CommunityMessengerCallStatus;
  sessionId?: string | null;
  tmpSessionId?: string | null;
  durationSeconds?: number | null;
  endedReason?: string | null;
  canonicalReason?: CanonicalTerminalReason | null;
  resolvedEvent?: CallSessionResolvedEvent | null;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
}): CallStubProjectionMetadata {
  const status = input.callStatus;
  const dur =
    status === "ended" && Math.max(0, Number(input.durationSeconds ?? 0)) > 0
      ? Math.max(0, Math.floor(Number(input.durationSeconds ?? 0)))
      : null;
  const tmp = trimText(input.tmpSessionId);
  return {
    callKind: input.callKind,
    callStatus: status,
    sessionId: trimText(input.sessionId) || null,
    ...(tmp ? { tmpSessionId: tmp } : {}),
    durationSeconds: dur,
    endedReason: trimText(input.endedReason) || null,
    canonicalReason: input.canonicalReason ?? null,
    callResolvedEvent: input.resolvedEvent ?? null,
    initiatorUserId: trimText(input.initiatorUserId) || null,
    recipientUserId: trimText(input.recipientUserId) || null,
  };
}
