import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  missed: vi.fn(async () => ({ ok: true, session: { id: "call-old", status: "missed" } })),
  fetchSession: vi.fn(async () => ({ id: "call-old", status: "ringing" })),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3PatchMissed: apiMocks.missed,
  callV3FetchSession: apiMocks.fetchSession,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-ringtone", () => ({
  stopCallV3Ringtone: vi.fn(),
  startCallV3Ringtone: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: vi.fn(),
  leaveCallV3Agora: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/multi-tab-bus", () => ({
  postCommunityMessengerCallSessionTerminalBusEvent: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-invite-realtime-broadcast", () => ({
  notifyCommunityMessengerCallInviteHangupBestEffort: vi.fn(),
}));

import {
  callV3HandleMissedTimeout,
  callV3IncomingDiscovered,
} from "@/lib/community-messenger/call-v3/call-v3-actions";
import { isCallV3IncomingDismissed, resetCallV3IncomingDismissedForTests } from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { resetCallV3PatchClaimsForTests } from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import { resetCallV3MissedTimersForTests } from "@/lib/community-messenger/call-v3/call-v3-missed-timeout";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function ringingSession(id: string): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "a",
    recipientUserId: "b",
    peerUserId: "a",
    peerLabel: "A",
    callKind: "voice",
    status: "ringing",
    startedAt: "2026-06-23T00:01:00.000Z",
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
  };
}

describe("call-v3-missed-redial", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCallV3PatchClaimsForTests();
    resetCallV3MissedTimersForTests();
    resetCallV3IncomingDismissedForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.missed.mockClear();
    apiMocks.fetchSession.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("missed cleanup enables same room redial with new callId", async () => {
    useCallV3Store.setState({
      phase: "incoming_ringing",
      identity: {
        callId: "call-old",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "incoming",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
      canReceiveNewCall: false,
    });

    await callV3HandleMissedTimeout("call-old", "incoming:no_answer");

    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canReceiveNewCall).toBe(true);
    expect(isCallV3IncomingDismissed("call-old")).toBe(true);

    callV3IncomingDiscovered(ringingSession("call-new"));
    expect(useCallV3Store.getState().phase).toBe("incoming_ringing");
    expect(useCallV3Store.getState().identity?.callId).toBe("call-new");
  });

  it("previous missed callId does not block new incoming", () => {
    callV3IncomingDiscovered(ringingSession("call-new"));
    expect(useCallV3Store.getState().identity?.callId).toBe("call-new");
  });
});
