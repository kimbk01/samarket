import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const apiMocks = vi.hoisted(() => ({
  reconcile: vi.fn(async () => undefined),
  fetchIncoming: vi.fn(async () => [] as CommunityMessengerCallSession[]),
  fetchSession: vi.fn(async () => null as CommunityMessengerCallSession | null),
}));

const actionMocks = vi.hoisted(() => ({
  discovered: vi.fn(),
  remoteTerminal: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-flag", () => ({
  isDibayCallV3SafeLaneEnabled: () => true,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3ReconcileBeforeIncoming: apiMocks.reconcile,
  callV3FetchIncomingSessions: apiMocks.fetchIncoming,
  callV3FetchSession: apiMocks.fetchSession,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-actions", () => ({
  callV3IncomingDiscovered: actionMocks.discovered,
  callV3HandleRemoteTerminal: actionMocks.remoteTerminal,
}));

import { runCallV3IncomingDiscoveryTick } from "@/lib/community-messenger/call-v3/call-v3-incoming-discovery";
import {
  markCallV3IncomingDismissed,
  resetCallV3IncomingDismissedForTests,
} from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

function ringingSession(id: string): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "caller",
    recipientUserId: "callee",
    peerUserId: "caller",
    peerLabel: "Caller",
    callKind: "voice",
    status: "ringing",
    startedAt: "2026-06-23T00:00:00.000Z",
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
  };
}

describe("call-v3-incoming-discovery", () => {
  beforeEach(() => {
    resetCallV3IncomingDismissedForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.reconcile.mockClear();
    apiMocks.fetchIncoming.mockClear();
    apiMocks.fetchSession.mockClear();
    actionMocks.discovered.mockClear();
    actionMocks.remoteTerminal.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("discovers ringing callee session", async () => {
    apiMocks.fetchIncoming.mockResolvedValueOnce([ringingSession("call-in-1")]);
    await runCallV3IncomingDiscoveryTick();
    expect(apiMocks.reconcile).toHaveBeenCalledTimes(1);
    expect(actionMocks.discovered).toHaveBeenCalledTimes(1);
    expect(actionMocks.discovered).toHaveBeenCalledWith(expect.objectContaining({ id: "call-in-1" }));
  });

  it("handles remote terminal for active incoming", async () => {
    useCallV3Store.setState({
      phase: "incoming_ringing",
      identity: {
        callId: "call-in-1",
        roomId: "room-1",
        callerUserId: "caller",
        calleeUserId: "callee",
        direction: "incoming",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
    });
    apiMocks.fetchIncoming.mockResolvedValueOnce([]);
    apiMocks.fetchSession.mockResolvedValueOnce({ ...ringingSession("call-in-1"), status: "cancelled" });

    await runCallV3IncomingDiscoveryTick();
    expect(actionMocks.remoteTerminal).toHaveBeenCalledWith("call-in-1", "cancelled");
  });

  it("does not block new incoming after stale call dismissed", async () => {
    markCallV3IncomingDismissed("call-old");
    apiMocks.fetchIncoming.mockResolvedValueOnce([ringingSession("call-new")]);
    await runCallV3IncomingDiscoveryTick();
    expect(actionMocks.discovered).toHaveBeenCalledWith(expect.objectContaining({ id: "call-new" }));
  });

  it("does not rediscover dismissed session while DB still ringing", async () => {
    markCallV3IncomingDismissed("call-in-1");
    apiMocks.fetchIncoming.mockResolvedValueOnce([ringingSession("call-in-1")]);
    await runCallV3IncomingDiscoveryTick();
    expect(actionMocks.discovered).not.toHaveBeenCalled();
  });
});
