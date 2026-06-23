import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  missed: vi.fn(async () => ({ ok: true, session: { id: "call-1", status: "missed" } })),
  fetchSession: vi.fn(async () => ({ id: "call-1", status: "ringing" })),
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

import { callV3HandleMissedTimeout } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { stopCallV3Ringtone } from "@/lib/community-messenger/call-v3/call-v3-ringtone";
import { resetCallV3PatchClaimsForTests } from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import { resetCallV3MissedTimersForTests } from "@/lib/community-messenger/call-v3/call-v3-missed-timeout";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-no-answer-cleanup", () => {
  beforeEach(() => {
    resetCallV3PatchClaimsForTests();
    resetCallV3MissedTimersForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.missed.mockClear();
    apiMocks.fetchSession.mockClear();
    vi.mocked(stopCallV3Ringtone).mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("incoming no-answer cleanup stops ringtone and resets idle", async () => {
    useCallV3Store.setState({
      phase: "incoming_ringing",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "incoming",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
      canReceiveNewCall: false,
    });

    await callV3HandleMissedTimeout("call-1", "incoming:no_answer");

    expect(stopCallV3Ringtone).toHaveBeenCalledWith("missed_timeout");
    expect(apiMocks.missed).toHaveBeenCalledTimes(1);
    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canReceiveNewCall).toBe(true);
  });

  it("outgoing no-answer cleanup resets caller idle", async () => {
    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
      canStartNewCall: false,
    });

    await callV3HandleMissedTimeout("call-1", "outgoing:no_answer");

    expect(apiMocks.missed).toHaveBeenCalledTimes(1);
    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canStartNewCall).toBe(true);
  });
});
