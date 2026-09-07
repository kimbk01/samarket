/**
 * CUT 6 — Connected transition Authority
 *
 * ACCEPTED ≠ CONNECTED.
 * answered_at = acceptance; connected_at = first media establishment (server clock).
 *
 * Writer: updateCommunityMessengerCallSession action "connected" only.
 * Events: community_messenger_call_events.event_type = "connected" (audit only).
 */

import {
  CALL_ANSWERED_ELSEWHERE_ERROR,
  evaluateAcceptDeviceClaim,
  normalizeAnswerClaimDeviceId,
} from "@/lib/community-messenger/call-multi-device-authority";
import { isServerCallSessionTerminalStatus } from "@/lib/community-messenger/server/call-session-transitions";

export const CALL_CONNECTED_SESSION_ACTION = "connected" as const;

export type ConnectedProposalDecision =
  | { ok: true; kind: "set" }
  | { ok: true; kind: "idempotent" }
  | {
      ok: false;
      error: "bad_action" | "forbidden" | "not_accepted" | typeof CALL_ANSWERED_ELSEWHERE_ERROR;
    };

function trimId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function idsEqual(a: string, b: string): boolean {
  return a.length > 0 && b.length > 0 && a === b;
}

/**
 * Gate a client connected proposal before server mutation.
 * Client timestamps are never trusted — caller must stamp connected_at with server time.
 */
export function evaluateConnectedProposal(input: {
  status: string | null | undefined;
  answeredAt: string | null | undefined;
  connectedAt: string | null | undefined;
  actorUserId: string;
  initiatorUserId: string;
  recipientUserId: string | null | undefined;
  answeredDeviceId?: string | null | undefined;
  requestDeviceId?: string | null | undefined;
}): ConnectedProposalDecision {
  const status = trimId(input.status).toLowerCase();
  const actor = trimId(input.actorUserId);
  const initiator = trimId(input.initiatorUserId);
  const recipient = trimId(input.recipientUserId ?? "");
  const isParty = idsEqual(actor, initiator) || (recipient.length > 0 && idsEqual(actor, recipient));
  if (!isParty) return { ok: false, error: "forbidden" };

  if (isServerCallSessionTerminalStatus(status)) {
    return { ok: false, error: "bad_action" };
  }

  // D1: ringing → connected proposal rejected (ACCEPTED required first)
  if (status === "ringing") {
    return { ok: false, error: "bad_action" };
  }

  if (status !== "active") {
    return { ok: false, error: "bad_action" };
  }

  if (!trimId(input.answeredAt ?? "")) {
    return { ok: false, error: "not_accepted" };
  }

  if (trimId(input.connectedAt ?? "")) {
    return { ok: true, kind: "idempotent" };
  }

  // Loser callee device must not stamp connected on the winner session.
  if (recipient.length > 0 && idsEqual(actor, recipient)) {
    const claim = evaluateAcceptDeviceClaim({
      sessionStatus: "active",
      claimedDeviceId: input.answeredDeviceId,
      requestDeviceId: input.requestDeviceId,
    });
    if (claim.kind === "answered_elsewhere") {
      return { ok: false, error: CALL_ANSWERED_ELSEWHERE_ERROR };
    }
  }

  return { ok: true, kind: "set" };
}

export function normalizeConnectedRequestDeviceId(raw: string | null | undefined): string | null {
  return normalizeAnswerClaimDeviceId(raw);
}
