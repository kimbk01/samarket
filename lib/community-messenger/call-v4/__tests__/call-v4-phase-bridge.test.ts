import { beforeEach, describe, expect, it, vi } from "vitest";
import { markCallV4MediaConnected } from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("call-v4-phase-bridge", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("promotes joining caller to connected when media is ready", () => {
    useCallV4Store.setState({
      phase: "joining",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
    });

    expect(markCallV4MediaConnected("call-1", "test")).toBe(true);
    expect(useCallV4Store.getState().phase).toBe("connected");
    expect(useCallV4Store.getState().connectedAt).not.toBeNull();
  });

  it("ignores mismatched callId", () => {
    useCallV4Store.setState({
      phase: "joining",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
    });

    expect(markCallV4MediaConnected("call-2", "test")).toBe(false);
    expect(useCallV4Store.getState().phase).toBe("joining");
  });
});
