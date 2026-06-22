import { beforeEach, describe, expect, it, vi } from "vitest";

const ringtoneMocks = vi.hoisted(() => ({
  stop: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-ringtone", () => ({
  stopCallV3Ringtone: ringtoneMocks.stop,
  startCallV3Ringtone: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: vi.fn(),
  leaveCallV3Agora: vi.fn(async () => undefined),
}));

import { callV3HandleRemoteTerminal } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { resetCallV3IncomingDismissedForTests } from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-remote-terminal", () => {
  beforeEach(() => {
    resetCallV3IncomingDismissedForTests();
    useCallV3Store.getState().resetToIdle();
    ringtoneMocks.stop.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("stops ringtone and cleans up on remote cancel", async () => {
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

    await callV3HandleRemoteTerminal("call-1", "cancelled");

    expect(ringtoneMocks.stop).toHaveBeenCalledWith("remote_terminal");
    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canReceiveNewCall).toBe(true);
  });

  it("ignores terminal for unrelated callId", async () => {
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
    });

    await callV3HandleRemoteTerminal("call-other", "cancelled");
    expect(ringtoneMocks.stop).not.toHaveBeenCalled();
    expect(useCallV3Store.getState().phase).toBe("incoming_ringing");
  });
});
