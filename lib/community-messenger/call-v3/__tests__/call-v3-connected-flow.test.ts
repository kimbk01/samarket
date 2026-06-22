import { beforeEach, describe, expect, it, vi } from "vitest";

const agoraMocks = vi.hoisted(() => ({
  join: vi.fn(async () => true),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: agoraMocks.join,
  leaveCallV3Agora: vi.fn(async () => undefined),
}));

import { callV3EnsureAgoraJoined } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

const identity = {
  callId: "call-1",
  roomId: "room-1",
  callerUserId: "a",
  calleeUserId: "b",
  direction: "incoming" as const,
  mediaType: "audio" as const,
  createdAt: "2026-06-23T00:00:00.000Z",
};

describe("call-v3-connected-flow", () => {
  beforeEach(() => {
    agoraMocks.join.mockClear();
    useCallV3Store.getState().resetToIdle();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("callee accept path moves joining to connected after agora join", async () => {
    useCallV3Store.setState({
      phase: "joining",
      identity,
      canReceiveNewCall: false,
    });

    await callV3EnsureAgoraJoined("call-1");

    expect(agoraMocks.join).toHaveBeenCalledTimes(1);
    expect(agoraMocks.join).toHaveBeenCalledWith("call-1");
    expect(useCallV3Store.getState().phase).toBe("connected");
    expect(useCallV3Store.getState().connectedAt).not.toBeNull();
  });

  it("does not join when phase is not joining", async () => {
    useCallV3Store.setState({ phase: "outgoing_ringing", identity });
    await callV3EnsureAgoraJoined("call-1");
    expect(agoraMocks.join).not.toHaveBeenCalled();
  });
});
