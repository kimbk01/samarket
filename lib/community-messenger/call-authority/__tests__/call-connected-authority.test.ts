import { describe, expect, it } from "vitest";
import { evaluateConnectedProposal } from "@/lib/community-messenger/call-authority/call-connected-authority";
import { CALL_ANSWERED_ELSEWHERE_ERROR } from "@/lib/community-messenger/call-multi-device-authority";

const base = {
  actorUserId: "callee-1",
  initiatorUserId: "caller-1",
  recipientUserId: "callee-1",
  answeredAt: "2026-07-29T12:00:05.000Z",
  connectedAt: null as string | null,
  answeredDeviceId: "device-winner",
  requestDeviceId: "device-winner",
};

describe("evaluateConnectedProposal (CUT6)", () => {
  it("D1: ringing → connected proposal rejected", () => {
    expect(
      evaluateConnectedProposal({
        ...base,
        status: "ringing",
        answeredAt: null,
      }),
    ).toEqual({ ok: false, error: "bad_action" });
  });

  it("D2: accepted/active → set", () => {
    expect(
      evaluateConnectedProposal({
        ...base,
        status: "active",
      }),
    ).toEqual({ ok: true, kind: "set" });
  });

  it("D3: duplicate connected → idempotent", () => {
    expect(
      evaluateConnectedProposal({
        ...base,
        status: "active",
        connectedAt: "2026-07-29T12:00:08.000Z",
      }),
    ).toEqual({ ok: true, kind: "idempotent" });
  });

  it("D4: terminal → late connected rejected", () => {
    expect(
      evaluateConnectedProposal({
        ...base,
        status: "ended",
      }),
    ).toEqual({ ok: false, error: "bad_action" });
  });

  it("D9–D11: missed/rejected/cancelled cannot connect", () => {
    for (const status of ["missed", "rejected", "cancelled"] as const) {
      expect(
        evaluateConnectedProposal({
          ...base,
          status,
          answeredAt: null,
        }),
      ).toEqual({ ok: false, error: "bad_action" });
    }
  });

  it("D14: loser callee device cannot corrupt winner session", () => {
    expect(
      evaluateConnectedProposal({
        ...base,
        status: "active",
        requestDeviceId: "device-loser",
      }),
    ).toEqual({ ok: false, error: CALL_ANSWERED_ELSEWHERE_ERROR });
  });

  it("caller may propose connected without device match", () => {
    expect(
      evaluateConnectedProposal({
        ...base,
        status: "active",
        actorUserId: "caller-1",
        requestDeviceId: "caller-device",
      }),
    ).toEqual({ ok: true, kind: "set" });
  });

  it("not_accepted when active without answered_at", () => {
    expect(
      evaluateConnectedProposal({
        ...base,
        status: "active",
        answeredAt: null,
      }),
    ).toEqual({ ok: false, error: "not_accepted" });
  });

  it("forbidden for non-party", () => {
    expect(
      evaluateConnectedProposal({
        ...base,
        status: "active",
        actorUserId: "stranger",
      }),
    ).toEqual({ ok: false, error: "forbidden" });
  });
});
