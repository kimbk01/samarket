import { describe, expect, it } from "vitest";
import { decideMissedCallBellNotify } from "@/lib/community-messenger/call-authority/call-missed-bell-authority";

describe("call-missed-bell-authority", () => {
  it("timeout missed with sent delivery → notify", () => {
    expect(
      decideMissedCallBellNotify({
        sessionMode: "direct",
        endedReason: "missed",
        deliveryRows: [{ status: "sent" }],
      }),
    ).toEqual({ notify: true });
  });

  it("timeout missed with push claim only → notify (delivery lag)", () => {
    expect(
      decideMissedCallBellNotify({
        sessionMode: "direct",
        endedReason: "missed",
        deliveryRows: [],
        incomingPushClaimedAt: "2026-07-29T05:06:11.033Z",
      }),
    ).toEqual({ notify: true });
  });

  it("no evidence → skip", () => {
    expect(
      decideMissedCallBellNotify({
        sessionMode: "direct",
        endedReason: "missed",
        deliveryRows: [],
        incomingPushClaimedAt: null,
      }),
    ).toEqual({ notify: false, skipReason: "no_delivery_evidence" });
  });

  it("incoming_policy_superseded → no Bell", () => {
    expect(
      decideMissedCallBellNotify({
        sessionMode: "direct",
        endedReason: "incoming_policy_superseded",
        deliveryRows: [{ status: "sent" }],
        incomingPushClaimedAt: "x",
      }),
    ).toEqual({ notify: false, skipReason: "incoming_policy_superseded" });
  });

  it("cancel/reject/busy/answered_elsewhere → no Bell", () => {
    for (const endedReason of ["canceled", "declined", "peer_busy", "answered_elsewhere"]) {
      expect(
        decideMissedCallBellNotify({
          sessionMode: "direct",
          endedReason,
          deliveryRows: [{ status: "sent" }],
        }).notify,
      ).toBe(false);
    }
  });

  it("nested nativeAck object counts as evidence", () => {
    expect(
      decideMissedCallBellNotify({
        sessionMode: "direct",
        endedReason: "missed",
        deliveryRows: [
          {
            status: "pending",
            provider_response: { nativeAck: { receivedAt: 1 } },
          },
        ],
      }),
    ).toEqual({ notify: true });
  });
});
