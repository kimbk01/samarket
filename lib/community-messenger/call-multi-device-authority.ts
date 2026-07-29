/**
 * Multi-device call authority helpers — first-answer-wins + missed evidence.
 * @see docs/dibay-call-multi-device-policy.md
 */

export const CALL_ANSWERED_ELSEWHERE_ERROR = "answered_elsewhere" as const;

export function normalizeAnswerClaimDeviceId(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t || t.length > 200) return null;
  return t;
}

export type AcceptDeviceClaimDecision =
  | { kind: "claim_new"; answeredDeviceId: string | null }
  | { kind: "idempotent_same_device" }
  | { kind: "answered_elsewhere" };

/**
 * Decide accept ownership for a session already loaded from DB.
 * Winner is always decided by CAS on the server; this only classifies outcomes.
 */
export function evaluateAcceptDeviceClaim(input: {
  sessionStatus: string;
  claimedDeviceId: string | null | undefined;
  requestDeviceId: string | null | undefined;
}): AcceptDeviceClaimDecision {
  const status = String(input.sessionStatus ?? "").trim().toLowerCase();
  const claimed = normalizeAnswerClaimDeviceId(input.claimedDeviceId);
  const request = normalizeAnswerClaimDeviceId(input.requestDeviceId);

  if (status === "ringing") {
    return { kind: "claim_new", answeredDeviceId: request };
  }

  if (status === "active") {
    if (!claimed) {
      // Pre-migration / legacy active without device — allow one soft claim, else block.
      if (request) return { kind: "claim_new", answeredDeviceId: request };
      return { kind: "idempotent_same_device" };
    }
    if (request && request === claimed) return { kind: "idempotent_same_device" };
    return { kind: "answered_elsewhere" };
  }

  return { kind: "answered_elsewhere" };
}

export type MissedDeliveryEvidenceRow = {
  status?: string | null;
  provider_response?: Record<string, unknown> | null;
};

/** True when at least one ringing delivery was sent or native-acked. */
export function hasMissedCallPresentationEvidence(rows: MissedDeliveryEvidenceRow[]): boolean {
  for (const row of rows) {
    const status = String(row.status ?? "").trim().toLowerCase();
    if (status === "sent") return true;
    const pr = row.provider_response;
    if (pr && typeof pr === "object") {
      if (pr.nativeAck === true || pr.nativeReceivedAt != null || pr.receivedAt != null) return true;
      const ack = pr.ack;
      if (ack && typeof ack === "object") {
        const a = ack as Record<string, unknown>;
        if (a.receivedAt != null || a.nativeReceivedAt != null) return true;
      }
    }
  }
  return false;
}
