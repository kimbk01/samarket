import { beforeEach, describe, expect, it, vi } from "vitest";

const agoraMocks = vi.hoisted(() => ({
  leave: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: vi.fn(),
  leaveCallV3Agora: agoraMocks.leave,
}));

import { callV3HandleRemoteTerminal } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { cleanupCallV3 } from "@/lib/community-messenger/call-v3/call-v3-cleanup";
import { exitCallV3ScreenAfterCleanup } from "@/lib/community-messenger/call-v3/call-v3-route";
import { resetCallV3IncomingDismissedForTests } from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

function stubCallV3ScreenWindow(): void {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { pathname: "/community-messenger/calls-v3/call-1", search: "", assign: vi.fn() },
  });
  vi.stubGlobal("sessionStorage", {
    setItem: (k: string, v: string) => storage.set(k, v),
    getItem: (k: string) => storage.get(k) ?? null,
    removeItem: (k: string) => storage.delete(k),
  });
}

describe("call-v3-cleanup-removes-current-screen", () => {
  beforeEach(() => {
    resetCallV3IncomingDismissedForTests();
    useCallV3Store.getState().resetToIdle();
    agoraMocks.leave.mockClear();
    vi.unstubAllGlobals();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("remote terminal on calls-v3 screen routes back after cleanup", async () => {
    stubCallV3ScreenWindow();
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

    const replace = vi.fn();
    await callV3HandleRemoteTerminal("call-1", "rejected", { replace });

    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(replace).toHaveBeenCalledWith("/community-messenger?section=call_logs");
  });

  it("cleanup alone leaves route exit to exitCallV3ScreenAfterCleanup", async () => {
    stubCallV3ScreenWindow();
    sessionStorage.setItem("samarket.cm.call_v3_return_path.v1", "/community-messenger/rooms/room-9");
    useCallV3Store.setState({ phase: "outgoing_ringing", canStartNewCall: false });

    await cleanupCallV3("call-9", "cancelled");
    expect(useCallV3Store.getState().phase).toBe("idle");

    const replace = vi.fn();
    exitCallV3ScreenAfterCleanup({ replace });
    expect(replace).toHaveBeenCalledWith("/community-messenger/rooms/room-9");
  });
});
