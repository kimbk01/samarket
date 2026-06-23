import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3FetchSession: vi.fn(async () => null),
  callV3PatchMissed: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/community-messenger/messenger-call-sound-config-client", () => ({
  getMessengerCallSoundConfigCache: () => ({ incomingRingTimeoutSeconds: 30 }),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-ringtone", () => ({
  stopCallV3Ringtone: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-caller-active", () => ({
  stopCallV3CallerActivePoll: vi.fn(),
}));

import {
  handleCallV3NativeCallRoute,
  markCallV3NativeBridgeReady,
  resetCallV3NativeBridgeForTests,
} from "@/lib/community-messenger/call-v3/call-v3-native-bridge";
import {
  resetCallV3MissedTimersForTests,
  startCallV3IncomingMissedTimer,
} from "@/lib/community-messenger/call-v3/call-v3-missed-timeout";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-fsi-missed", () => {
  beforeEach(() => {
    resetCallV3NativeBridgeForTests();
    resetCallV3MissedTimersForTests();
    useCallV3Store.getState().resetToIdle();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("FSI lock wake stores pending route; incoming_ringing starts 30s missed timer", async () => {
    const startedAt = new Date(Date.now() - 5_000).toISOString();

    handleCallV3NativeCallRoute("/community-messenger/calls/call-missed?source=native_push");

    const storeLogs = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_pending_store");
    expect(storeLogs).toHaveLength(1);

    markCallV3NativeBridgeReady();
    await Promise.resolve();

    useCallV3Store.setState({
      phase: "incoming_ringing",
      identity: {
        callId: "call-missed",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "incoming",
        mediaType: "audio",
        createdAt: startedAt,
      },
      canReceiveNewCall: false,
    });
    startCallV3IncomingMissedTimer("call-missed", startedAt);

    const startLogs = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "missed_timer_start");
    expect(startLogs).toHaveLength(1);

    vi.advanceTimersByTime(26_000);
    await Promise.resolve();
    await Promise.resolve();

    const fireLogs = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "missed_timer_fire");
    expect(fireLogs).toHaveLength(1);
    expect(fireLogs[0]?.[2]).toMatchObject({ callId: "call-missed", role: "incoming" });
  });
});
