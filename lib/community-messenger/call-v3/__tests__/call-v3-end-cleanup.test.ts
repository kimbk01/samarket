import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  patchEnd: vi.fn(async () => ({ ok: true })),
}));

const agoraMocks = vi.hoisted(() => ({
  leave: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3PatchEnd: apiMocks.patchEnd,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: vi.fn(),
  leaveCallV3Agora: agoraMocks.leave,
}));

vi.mock("@/lib/community-messenger/multi-tab-bus", () => ({
  postCommunityMessengerCallSessionTerminalBusEvent: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-invite-realtime-broadcast", () => ({
  notifyCommunityMessengerCallInviteHangupBestEffort: vi.fn(),
}));

import { callV3End } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { notifyCommunityMessengerCallInviteHangupBestEffort } from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { postCommunityMessengerCallSessionTerminalBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { resetCallV3PatchClaimsForTests } from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-end-cleanup", () => {
  beforeEach(() => {
    resetCallV3PatchClaimsForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.patchEnd.mockClear();
    agoraMocks.leave.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("patches end once, leaves agora, and resets store", async () => {
    useCallV3Store.setState({
      phase: "connected",
      connectedAt: Date.now() - 5_000,
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
      canReceiveNewCall: false,
    });

    const replace = vi.fn();
    await callV3End("call-1", { replace });

    expect(apiMocks.patchEnd).toHaveBeenCalledTimes(1);
    expect(notifyCommunityMessengerCallInviteHangupBestEffort).toHaveBeenCalledWith(
      "b",
      "call-1",
      expect.objectContaining({ terminalStatus: "ended" })
    );
    expect(postCommunityMessengerCallSessionTerminalBusEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "call-1", status: "ended" })
    );
    expect(agoraMocks.leave).toHaveBeenCalledWith("call-1");
    expect(replace).toHaveBeenCalled();
    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canStartNewCall).toBe(true);
  });

  it("does not double-patch end", async () => {
    useCallV3Store.setState({ phase: "connected", connectedAt: Date.now() });
    const replace = vi.fn();
    await callV3End("call-2", { replace });
    await callV3End("call-2", { replace });
    expect(apiMocks.patchEnd).toHaveBeenCalledTimes(1);
  });
});
