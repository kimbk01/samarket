import { describe, expect, it } from "vitest";
import { evaluateIncomingCallBusyPolicy } from "@/lib/call/call-state";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function ringingSession(id: string): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    sessionMode: "direct",
    callKind: "voice",
    status: "ringing",
    isMineInitiator: false,
    initiatorUserId: "user-a",
    recipientUserId: "user-b",
    peerUserId: "user-a",
    peerLabel: "A",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    endedReason: null,
    participants: [],
  };
}

describe("evaluateIncomingCallBusyPolicy", () => {
  it("auto-rejects when another live session exists", () => {
    const incoming = ringingSession("call-in");
    expect(
      evaluateIncomingCallBusyPolicy({ incoming, otherLiveSessionId: "call-active" }).shouldAutoReject
    ).toBe(true);
  });

  it("does not auto-reject when no other live session", () => {
    const incoming = ringingSession("call-in");
    expect(evaluateIncomingCallBusyPolicy({ incoming, otherLiveSessionId: null }).shouldAutoReject).toBe(
      false
    );
  });

  it("does not auto-reject for the same session id", () => {
    const incoming = ringingSession("call-in");
    expect(
      evaluateIncomingCallBusyPolicy({ incoming, otherLiveSessionId: "call-in" }).shouldAutoReject
    ).toBe(false);
  });
});
