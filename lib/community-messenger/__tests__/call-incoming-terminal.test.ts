import { describe, expect, it } from "vitest";
import {
  filterRemoveIncomingSessionsMatchingTerminal,
  hasIncomingCallSessionMatchingTerminal,
  matchIncomingCallSessionToTerminalQuery,
} from "@/lib/community-messenger/call-incoming-terminal";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function session(
  partial: Partial<CommunityMessengerCallSession> & Pick<CommunityMessengerCallSession, "id" | "status">
): CommunityMessengerCallSession {
  const { id, status, ...rest } = partial;
  return {
    id,
    status,
    roomId: "room-a",
    sessionMode: "direct",
    callKind: "video",
    initiatorUserId: "caller-1",
    recipientUserId: "callee-1",
    peerUserId: "caller-1",
    peerLabel: "Caller",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    endedReason: null,
    isMineInitiator: false,
    participants: [],
    ...rest,
  };
}

describe("call-incoming-terminal", () => {
  it("removes only the session that matches sessionId", () => {
    const first = session({ id: "call-1", status: "ringing" });
    const second = session({ id: "call-2", status: "ringing" });
    const { next, removed } = filterRemoveIncomingSessionsMatchingTerminal(
      [first, second],
      {
        sessionId: "call-1",
        roomId: "room-a",
        initiatorUserId: "caller-1",
        callKind: "video",
        status: "cancelled",
      }
    );
    expect(removed.map((s) => s.id)).toEqual(["call-1"]);
    expect(next.map((s) => s.id)).toEqual(["call-2"]);
  });

  it("does not remove a newer ringing session when terminal event carries an older sessionId", () => {
    const second = session({ id: "call-2", status: "ringing" });
    const { match, matchedBy } = matchIncomingCallSessionToTerminalQuery(second, {
      sessionId: "call-1",
      roomId: "room-a",
      initiatorUserId: "caller-1",
      callKind: "video",
      status: "ended",
    });
    expect(match).toBe(false);
    expect(matchedBy).toBe("");
  });

  it("still removes by room triple when terminal event has no session identifiers", () => {
    const ringing = session({ id: "call-2", status: "ringing" });
    const { match, matchedBy } = matchIncomingCallSessionToTerminalQuery(ringing, {
      roomId: "room-a",
      initiatorUserId: "caller-1",
      callKind: "video",
      status: "cancelled",
    });
    expect(match).toBe(true);
    expect(matchedBy).toBe("room_initiator_kind");
  });

  it("matches dial tmp session id on preview row", () => {
    const preview = session({
      id: "real-call-1",
      status: "ringing",
      tmpSessionId: "tmp_dial_1",
      source: "invite_preview",
      isPreview: true,
    });
    const { match, matchedBy } = matchIncomingCallSessionToTerminalQuery(preview, {
      sessionId: "tmp_dial_1",
      status: "cancelled",
    });
    expect(match).toBe(true);
    expect(matchedBy).toBe("session_cross_tmp");
  });

  it("hasIncomingCallSessionMatchingTerminal detects local rows before removal", () => {
    const ringing = session({ id: "call-2", status: "ringing" });
    expect(
      hasIncomingCallSessionMatchingTerminal([ringing], {
        sessionId: "call-2",
        status: "cancelled",
      })
    ).toBe(true);
    expect(
      hasIncomingCallSessionMatchingTerminal([ringing], {
        sessionId: "call-1",
        roomId: "room-a",
        initiatorUserId: "caller-1",
        callKind: "video",
        status: "cancelled",
      })
    ).toBe(false);
  });
});
