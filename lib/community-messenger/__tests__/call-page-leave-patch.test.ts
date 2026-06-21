import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bestEffortKeepaliveCallSessionTeardown,
  terminalPatchAction,
  shouldSkipRingingCallSessionPageLeaveTeardown,
} from "@/lib/community-messenger/call-page-leave-patch";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function session(
  partial: Partial<CommunityMessengerCallSession> & Pick<CommunityMessengerCallSession, "status" | "isMineInitiator">
): CommunityMessengerCallSession {
  return {
    id: "s1",
    roomId: "r1",
    sessionMode: "direct",
    callKind: "voice",
    initiatorUserId: "a",
    recipientUserId: "b",
    peerUserId: "b",
    peerLabel: "B",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    endedReason: null,
    participants: [],
    ...partial,
  };
}

describe("terminalPatchAction", () => {
  it("maps ringing initiator to cancel", () => {
    expect(terminalPatchAction(session({ status: "ringing", isMineInitiator: true }))).toBe("cancel");
  });

  it("maps ringing callee to reject", () => {
    expect(terminalPatchAction(session({ status: "ringing", isMineInitiator: false }))).toBe("reject");
  });

  it("maps active to end", () => {
    expect(terminalPatchAction(session({ status: "active", isMineInitiator: true }))).toBe("end");
  });

  it("returns null for terminal statuses", () => {
    expect(terminalPatchAction(session({ status: "ended", isMineInitiator: true }))).toBeNull();
  });
});

describe("bestEffortKeepaliveCallSessionTeardown", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("does not PATCH active sessions (F5 recovery safe)", () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    bestEffortKeepaliveCallSessionTeardown({
      session: session({ status: "active", isMineInitiator: true }),
      durationSeconds: 12,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PATCHes ringing cancel once", () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    bestEffortKeepaliveCallSessionTeardown({
      session: session({ status: "ringing", isMineInitiator: true }),
      durationSeconds: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("shouldSkipRingingCallSessionPageLeaveTeardown", () => {
  const base = {
    sessionId: "s1",
    acceptInFlight: false,
    rejectInFlight: false,
    directPatchInFlight: false,
    joining: false,
    requestedActionAccept: false,
    busyAcceptOrJoin: false,
    calleeConnectingShell: false,
    nativeAcceptPending: false,
  };

  it("skips when accept is in flight", () => {
    expect(shouldSkipRingingCallSessionPageLeaveTeardown({ ...base, acceptInFlight: true })).toBe(true);
  });

  it("skips when callee accept route is pending", () => {
    expect(
      shouldSkipRingingCallSessionPageLeaveTeardown({ ...base, requestedActionAccept: true })
    ).toBe(true);
  });

  it("allows teardown when idle ringing callee", () => {
    expect(shouldSkipRingingCallSessionPageLeaveTeardown(base)).toBe(false);
  });
});
