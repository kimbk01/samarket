import { describe, expect, it } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { buildIncomingPresenterDecisionPayload } from "@/lib/community-messenger/incoming-call/incoming-presenter-decision-log";

function ringingSession(id: string): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "caller",
    recipientUserId: "self",
    peerUserId: "caller",
    peerLabel: "Caller",
    callKind: "voice",
    status: "ringing",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
  };
}

describe("incoming-presenter-decision-log", () => {
  it("reports busy_auto_reject reason when live session blocks overlay candidate", () => {
    const incoming = ringingSession("call-2");
    const payload = buildIncomingPresenterDecisionPayload({
      pathname: "/community-messenger/calls/call-1",
      userId: "self",
      incomingTabLeader: true,
      incomingTabLeaderRaw: true,
      incomingVisibilityState: "visible",
      isCapacitorNative: true,
      sessions: [
        {
          ...ringingSession("call-1"),
          status: "active",
        },
        incoming,
      ],
      viewerLiveSessionId: "call-1",
      firstRingingCalleeSession: null,
      directRingingCalleeSession: incoming,
      visibleSession: null,
      incomingSurface: null,
      renderIncomingBanner: false,
      hardClearedAt: new Map(),
    });

    expect(payload.busyPolicyShouldAutoReject).toBe(true);
    expect(payload.viewerLiveSessionId).toBe("call-1");
    expect(payload.sessionsCount).toBe(2);
    expect(payload.reason).toContain("busy_auto_reject");
  });
});
