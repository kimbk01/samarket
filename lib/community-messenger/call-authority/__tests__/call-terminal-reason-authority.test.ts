import { describe, expect, it } from "vitest";
import {
  isTrustedClientEndedReason,
  mapStoredToProductEndReason,
  normalizeIncomingReasonToken,
  resolveCanonicalTerminalReason,
  resolveTerminalEndedReason,
  resolveWireEndedReasonFromTrustedClient,
  CANONICAL_TERMINAL_REASONS,
} from "@/lib/community-messenger/call-authority/call-terminal-reason-authority";

describe("call-terminal-reason-authority CUT3", () => {
  it("exposes full canonical taxonomy", () => {
    expect(CANONICAL_TERMINAL_REASONS).toEqual([
      "caller_cancelled",
      "callee_rejected",
      "missed_timeout",
      "busy",
      "ended_by_caller",
      "ended_by_callee",
      "disconnected",
      "failed_setup",
      "failed_network",
      "answered_elsewhere",
      "superseded",
    ]);
  });

  it("maps reject/cancel/missed/end wire defaults", () => {
    expect(resolveTerminalEndedReason({ action: "reject", nextStatus: "rejected" })).toBe("declined");
    expect(resolveTerminalEndedReason({ action: "cancel", nextStatus: "cancelled" })).toBe("canceled");
    expect(resolveTerminalEndedReason({ action: "missed", nextStatus: "missed" })).toBe("missed");
    expect(resolveTerminalEndedReason({ action: "end", nextStatus: "ended" })).toBe("ended");
  });

  it("writes ended_by_caller / ended_by_callee when actor + answered known", () => {
    expect(
      resolveTerminalEndedReason({
        action: "end",
        nextStatus: "ended",
        actorUserId: "caller",
        initiatorUserId: "caller",
        recipientUserId: "callee",
        answeredAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe("ended_by_caller");
    expect(
      resolveTerminalEndedReason({
        action: "end",
        nextStatus: "ended",
        actorUserId: "callee",
        initiatorUserId: "caller",
        recipientUserId: "callee",
        answeredAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe("ended_by_callee");
  });

  it("normalizes missed-timeout wire synonyms to missed", () => {
    expect(
      resolveTerminalEndedReason({
        action: "missed",
        nextStatus: "missed",
        clientEndedReason: "stale_ringing_expired",
      }),
    ).toBe("missed");
    expect(
      resolveTerminalEndedReason({
        action: "missed",
        nextStatus: "missed",
        clientEndedReason: "reconcile_stale_ringing",
      }),
    ).toBe("missed");
    expect(resolveWireEndedReasonFromTrustedClient("stale_ringing_expired", "missed")).toBe("missed");
  });

  it("normalizes reconcile_stale_active to heartbeat_timeout wire on ended", () => {
    expect(
      resolveTerminalEndedReason({
        action: "end",
        nextStatus: "ended",
        clientEndedReason: "reconcile_stale_active",
      }),
    ).toBe("heartbeat_timeout");
  });

  it("persists heartbeat_timeout and redial_replaced", () => {
    expect(
      resolveTerminalEndedReason({
        action: "end",
        nextStatus: "ended",
        clientEndedReason: "heartbeat_timeout",
      }),
    ).toBe("heartbeat_timeout");
    expect(
      resolveTerminalEndedReason({
        action: "end",
        nextStatus: "ended",
        clientEndedReason: "redial_replaced",
      }),
    ).toBe("redial_replaced");
  });

  it("ignores untrusted client reasons", () => {
    expect(isTrustedClientEndedReason("invented_reason")).toBe(false);
    expect(
      resolveTerminalEndedReason({
        action: "end",
        nextStatus: "ended",
        clientEndedReason: "invented_reason",
      }),
    ).toBe("ended");
  });

  it("folds aliases", () => {
    expect(normalizeIncomingReasonToken("cancelled")).toBe("canceled");
    expect(normalizeIncomingReasonToken("REJECTED")).toBe("declined");
    expect(normalizeIncomingReasonToken("ring_timeout")).toBe("missed");
    expect(normalizeIncomingReasonToken("callee_busy")).toBe("peer_busy");
  });

  it("R1–R12 required matrix", () => {
    // R1 ringing + caller cancel
    expect(
      resolveCanonicalTerminalReason({
        status: "cancelled",
        endedReason: resolveTerminalEndedReason({ action: "cancel", nextStatus: "cancelled" }),
      }),
    ).toBe("caller_cancelled");
    // R2 ringing + callee reject
    expect(
      resolveCanonicalTerminalReason({
        status: "rejected",
        endedReason: resolveTerminalEndedReason({ action: "reject", nextStatus: "rejected" }),
      }),
    ).toBe("callee_rejected");
    // R3 ringing deadline
    expect(
      resolveCanonicalTerminalReason({
        status: "missed",
        endedReason: resolveTerminalEndedReason({
          action: "missed",
          nextStatus: "missed",
          clientEndedReason: "stale_ringing_expired",
        }),
      }),
    ).toBe("missed_timeout");
    // R4 connected + caller end
    expect(
      resolveCanonicalTerminalReason({
        status: "ended",
        endedReason: resolveTerminalEndedReason({
          action: "end",
          nextStatus: "ended",
          actorUserId: "c1",
          initiatorUserId: "c1",
          recipientUserId: "c2",
          answeredAt: "t",
        }),
        answeredAt: "t",
      }),
    ).toBe("ended_by_caller");
    // R5 connected + callee end
    expect(
      resolveCanonicalTerminalReason({
        status: "ended",
        endedReason: resolveTerminalEndedReason({
          action: "end",
          nextStatus: "ended",
          actorUserId: "c2",
          initiatorUserId: "c1",
          recipientUserId: "c2",
          answeredAt: "t",
        }),
        answeredAt: "t",
      }),
    ).toBe("ended_by_callee");
    // R6 post-connect network loss
    expect(
      resolveCanonicalTerminalReason({
        status: "ended",
        endedReason: "failed_network",
        answeredAt: "t",
      }),
    ).toBe("disconnected");
    expect(
      resolveCanonicalTerminalReason({
        status: "ended",
        endedReason: "heartbeat_timeout",
        answeredAt: "t",
      }),
    ).toBe("disconnected");
    // R7 pre-connect signaling failure
    expect(
      resolveCanonicalTerminalReason({
        status: "ended",
        endedReason: "failed_signaling",
      }),
    ).toBe("failed_setup");
    // R8 answered_elsewhere — device/API presentation, not session corruption
    expect(
      resolveCanonicalTerminalReason({ status: "active", apiError: "answered_elsewhere" }),
    ).toBe("answered_elsewhere");
    expect(resolveCanonicalTerminalReason({ status: "active", endedReason: null })).toBeNull();
    // R9 peer_busy pre-create — API only
    expect(resolveCanonicalTerminalReason({ status: "", apiError: "peer_busy" })).toBe("busy");
    expect(resolveTerminalEndedReason({ action: "end", nextStatus: "ended", clientEndedReason: "peer_busy" })).toBe(
      "ended",
    );
    // R10–R12 legacy compatibility
    expect(resolveCanonicalTerminalReason({ status: "rejected", endedReason: "declined" })).toBe("callee_rejected");
    expect(resolveCanonicalTerminalReason({ status: "cancelled", endedReason: "canceled" })).toBe(
      "caller_cancelled",
    );
    expect(
      resolveCanonicalTerminalReason({
        status: "ended",
        endedReason: "ended",
        terminalActorUserId: "c1",
        initiatorUserId: "c1",
        recipientUserId: "c2",
        answeredAt: "t",
      }),
    ).toBe("ended_by_caller");
  });

  it("resolves canonical taxonomy from status+reason", () => {
    expect(resolveCanonicalTerminalReason({ status: "cancelled", endedReason: "canceled" })).toBe(
      "caller_cancelled",
    );
    expect(resolveCanonicalTerminalReason({ status: "rejected", endedReason: "declined" })).toBe(
      "callee_rejected",
    );
    expect(resolveCanonicalTerminalReason({ status: "missed", endedReason: "missed" })).toBe(
      "missed_timeout",
    );
    expect(resolveCanonicalTerminalReason({ status: "missed", endedReason: "stale_ringing_expired" })).toBe(
      "missed_timeout",
    );
    expect(resolveCanonicalTerminalReason({ status: "ended", endedReason: "failed_network" })).toBe(
      "failed_network",
    );
    expect(resolveCanonicalTerminalReason({ status: "ended", endedReason: "failed_ice" })).toBe(
      "failed_setup",
    );
    expect(resolveCanonicalTerminalReason({ status: "ended", endedReason: "heartbeat_timeout" })).toBe(
      "disconnected",
    );
    expect(resolveCanonicalTerminalReason({ status: "ended", endedReason: "redial_replaced" })).toBe(
      "superseded",
    );
    expect(resolveCanonicalTerminalReason({ status: "", apiError: "peer_busy" })).toBe("busy");
    expect(resolveCanonicalTerminalReason({ status: "", apiError: "answered_elsewhere" })).toBe(
      "answered_elsewhere",
    );
  });

  it("distinguishes ended_by_caller vs ended_by_callee when actor known", () => {
    expect(
      resolveCanonicalTerminalReason({
        status: "ended",
        endedReason: "ended",
        terminalActorUserId: "caller",
        initiatorUserId: "caller",
        recipientUserId: "callee",
      }),
    ).toBe("ended_by_caller");
    expect(
      resolveCanonicalTerminalReason({
        status: "ended",
        endedReason: "ended",
        terminalActorUserId: "callee",
        initiatorUserId: "caller",
        recipientUserId: "callee",
      }),
    ).toBe("ended_by_callee");
  });

  it("mapStoredToProductEndReason aliases to canonical", () => {
    expect(mapStoredToProductEndReason({ status: "cancelled", endedReason: "canceled" })).toBe(
      "caller_cancelled",
    );
    expect(mapStoredToProductEndReason({ status: "rejected", endedReason: "declined" })).toBe(
      "callee_rejected",
    );
    expect(mapStoredToProductEndReason({ status: "missed", endedReason: "missed" })).toBe("missed_timeout");
    expect(mapStoredToProductEndReason({ status: "ended", endedReason: "failed_network" })).toBe(
      "failed_network",
    );
  });
});
