import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handleMissedMocks = vi.hoisted(() => ({
  handleMissed: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({
  callV4HandleMissedTimeout: handleMissedMocks.handleMissed,
}));

import {
  clearCallV4MissedTimer,
  readCallV4MissedTimeoutMsForTests,
  readCallV4MissedTimerCallIdForTests,
  resetCallV4MissedTimersForTests,
  startCallV4OutgoingMissedTimer,
} from "@/lib/community-messenger/call-v4/call-v4-missed-timeout";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("call-v4-missed-timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCallV4MissedTimersForTests();
    useCallV4Store.getState().resetToIdle();
    handleMissedMocks.handleMissed.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    resetCallV4MissedTimersForTests();
  });

  it("defaults outgoing no-answer timer to 30 seconds", () => {
    expect(readCallV4MissedTimeoutMsForTests()).toBe(30_000);
  });

  it("outgoing no-answer timer fires once", async () => {
    const startedAt = new Date("2026-06-23T00:00:00.000Z").toISOString();
    vi.setSystemTime(new Date("2026-06-23T00:00:00.000Z"));

    useCallV4Store.setState({
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

    startCallV4OutgoingMissedTimer("call-out", startedAt);
    expect(readCallV4MissedTimerCallIdForTests()).toBe("call-out");

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();

    expect(handleMissedMocks.handleMissed).toHaveBeenCalledTimes(1);
    expect(handleMissedMocks.handleMissed).toHaveBeenCalledWith("call-out", "outgoing:no_answer", undefined);
    expect(readCallV4MissedTimerCallIdForTests()).toBeNull();
  });

  it("does not start timer for incoming ringing", async () => {
    const startedAt = new Date("2026-06-23T00:00:00.000Z").toISOString();
    vi.setSystemTime(new Date("2026-06-23T00:00:00.000Z"));

    useCallV4Store.setState({
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

    startCallV4OutgoingMissedTimer("call-in", startedAt);
    expect(readCallV4MissedTimerCallIdForTests()).toBeNull();

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();

    expect(handleMissedMocks.handleMissed).not.toHaveBeenCalled();
  });

  it("clears outgoing timer before fire", async () => {
    const startedAt = new Date("2026-06-23T00:00:00.000Z").toISOString();
    vi.setSystemTime(new Date("2026-06-23T00:00:00.000Z"));

    useCallV4Store.setState({
      phase: "outgoing_ringing",
      identity: {
        callId: "call-clear",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: startedAt,
      },
    });

    startCallV4OutgoingMissedTimer("call-clear", startedAt);
    clearCallV4MissedTimer("call-clear");
    expect(readCallV4MissedTimerCallIdForTests()).toBeNull();

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();

    expect(handleMissedMocks.handleMissed).not.toHaveBeenCalled();
  });
});
