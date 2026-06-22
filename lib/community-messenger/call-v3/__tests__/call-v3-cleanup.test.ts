import { describe, expect, it } from "vitest";
import { cleanupCallV3 } from "@/lib/community-messenger/call-v3/call-v3-cleanup";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-cleanup", () => {
  it("resets store to idle and enables new calls", async () => {
    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: {
        callId: "c-1",
        roomId: "r-1",
        callerUserId: "u-a",
        calleeUserId: "u-b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
      canStartNewCall: false,
      canReceiveNewCall: false,
    });

    await cleanupCallV3("c-1", "cancelled");

    const state = useCallV3Store.getState();
    expect(state.phase).toBe("idle");
    expect(state.identity).toBeNull();
    expect(state.canStartNewCall).toBe(true);
    expect(state.canReceiveNewCall).toBe(true);
  });
});
