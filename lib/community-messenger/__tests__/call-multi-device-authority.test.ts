import { describe, expect, it } from "vitest";
import {
  CALL_ANSWERED_ELSEWHERE_ERROR,
  evaluateAcceptDeviceClaim,
  hasMissedCallPresentationEvidence,
  normalizeAnswerClaimDeviceId,
} from "@/lib/community-messenger/call-multi-device-authority";

describe("call-multi-device-authority", () => {
  it("normalizes device ids", () => {
    expect(normalizeAnswerClaimDeviceId("  abc  ")).toBe("abc");
    expect(normalizeAnswerClaimDeviceId("")).toBeNull();
    expect(normalizeAnswerClaimDeviceId(null)).toBeNull();
  });

  it("claims new device while ringing", () => {
    expect(
      evaluateAcceptDeviceClaim({
        sessionStatus: "ringing",
        claimedDeviceId: null,
        requestDeviceId: "android-a",
      }),
    ).toEqual({ kind: "claim_new", answeredDeviceId: "android-a" });
  });

  it("same device accept is idempotent when already active", () => {
    expect(
      evaluateAcceptDeviceClaim({
        sessionStatus: "active",
        claimedDeviceId: "ios-b",
        requestDeviceId: "ios-b",
      }),
    ).toEqual({ kind: "idempotent_same_device" });
  });

  it("different device accept after claim is answered_elsewhere", () => {
    expect(
      evaluateAcceptDeviceClaim({
        sessionStatus: "active",
        claimedDeviceId: "android-a",
        requestDeviceId: "ios-b",
      }),
    ).toEqual({ kind: "answered_elsewhere" });
    expect(CALL_ANSWERED_ELSEWHERE_ERROR).toBe("answered_elsewhere");
  });

  it("missed evidence requires sent or native ack", () => {
    expect(hasMissedCallPresentationEvidence([])).toBe(false);
    expect(hasMissedCallPresentationEvidence([{ status: "failed" }])).toBe(false);
    expect(hasMissedCallPresentationEvidence([{ status: "sent" }])).toBe(true);
    expect(
      hasMissedCallPresentationEvidence([
        { status: "pending", provider_response: { ack: { receivedAt: 1 } } },
      ]),
    ).toBe(true);
  });
});
