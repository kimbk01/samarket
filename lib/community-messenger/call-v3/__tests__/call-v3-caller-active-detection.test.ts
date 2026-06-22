import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchSession: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3FetchSession: apiMocks.fetchSession,
}));

import {
  readCallV3CallerActivePollCallIdForTests,
  resetCallV3CallerActivePollForTests,
  startCallV3CallerActivePoll,
} from "@/lib/community-messenger/call-v3/call-v3-caller-active";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-caller-active-detection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCallV3CallerActivePollForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.fetchSession.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    resetCallV3CallerActivePollForTests();
  });

  it("caller detects active session and moves to joining", async () => {
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

    apiMocks.fetchSession.mockResolvedValue({
      id: "call-1",
      status: "active",
      roomId: "room-1",
      initiatorUserId: "a",
      isMineInitiator: true,
    });

    startCallV3CallerActivePoll("call-1");
    expect(readCallV3CallerActivePollCallIdForTests()).toBe("call-1");

    await vi.advanceTimersByTimeAsync(0);
    expect(useCallV3Store.getState().phase).toBe("joining");
  });

  it("ignores active detection for unrelated phase", async () => {
    useCallV3Store.setState({ phase: "idle" });
    apiMocks.fetchSession.mockResolvedValue({ id: "call-1", status: "active" });

    startCallV3CallerActivePoll("call-1");
    await vi.advanceTimersByTimeAsync(1_500);

    expect(apiMocks.fetchSession).not.toHaveBeenCalled();
    expect(useCallV3Store.getState().phase).toBe("idle");
  });
});
