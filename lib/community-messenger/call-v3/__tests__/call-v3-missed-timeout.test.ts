import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handleMissedMocks = vi.hoisted(() => ({
  handleMissed: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-actions", () => ({
  callV3HandleMissedTimeout: handleMissedMocks.handleMissed,
}));

import {
  clearCallV3MissedTimer,
  readCallV3MissedTimeoutMsForTests,
  readCallV3MissedTimerCallIdForTests,
  resetCallV3MissedTimersForTests,
  startCallV3IncomingMissedTimer,
  startCallV3OutgoingMissedTimer,
} from "@/lib/community-messenger/call-v3/call-v3-missed-timeout";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-missed-timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCallV3MissedTimersForTests();
    useCallV3Store.getState().resetToIdle();
    handleMissedMocks.handleMissed.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    resetCallV3MissedTimersForTests();
  });

  it("defaults outgoing no-answer timer to 30 seconds", () => {
    expect(readCallV3MissedTimeoutMsForTests()).toBe(30_000);
  });

  it("outgoing no-answer timer fires once", async () => {
    const startedAt = new Date("2026-06-23T00:00:00.000Z").toISOString();
    vi.setSystemTime(new Date("2026-06-23T00:00:00.000Z"));

    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: {
        callId: "call-out",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: startedAt,
      },
    });

    startCallV3OutgoingMissedTimer("call-out", startedAt);
    expect(readCallV3MissedTimerCallIdForTests()).toBe("call-out");

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();

    expect(handleMissedMocks.handleMissed).toHaveBeenCalledTimes(1);
    expect(handleMissedMocks.handleMissed).toHaveBeenCalledWith("call-out", "outgoing:no_answer", undefined);
    expect(readCallV3MissedTimerCallIdForTests()).toBeNull();
  });

  it("incoming no-answer timer fires once", async () => {
    const startedAt = new Date("2026-06-23T00:00:00.000Z").toISOString();
    vi.setSystemTime(new Date("2026-06-23T00:00:00.000Z"));

    useCallV3Store.setState({
      phase: "incoming_ringing",
      identity: {
        callId: "call-in",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "incoming",
        mediaType: "audio",
        createdAt: startedAt,
      },
    });

    startCallV3IncomingMissedTimer("call-in", startedAt);
    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();

    expect(handleMissedMocks.handleMissed).toHaveBeenCalledTimes(1);
    expect(handleMissedMocks.handleMissed).toHaveBeenCalledWith("call-in", "incoming:no_answer", undefined);
  });

  it("clears timer on accept/reject/cancel/connected phases", () => {
    const startedAt = new Date("2026-06-23T00:00:00.000Z").toISOString();
    vi.setSystemTime(new Date("2026-06-23T00:00:00.000Z"));

    useCallV3Store.setState({
      phase: "incoming_ringing",
      identity: {
        callId: "call-clear",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "incoming",
        mediaType: "audio",
        createdAt: startedAt,
      },
    });

    startCallV3IncomingMissedTimer("call-clear", startedAt);
    clearCallV3MissedTimer("call-clear");
    expect(readCallV3MissedTimerCallIdForTests()).toBeNull();
  });
});
