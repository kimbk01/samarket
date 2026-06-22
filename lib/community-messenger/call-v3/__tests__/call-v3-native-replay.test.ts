import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  enqueueCallV3NativeEvent,
  markCallV3NativeBridgeReady,
  resetCallV3NativeBridgeForTests,
} from "@/lib/community-messenger/call-v3/call-v3-native-bridge";

describe("call-v3-native-replay", () => {
  beforeEach(() => {
    resetCallV3NativeBridgeForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("replays pending native accept once after bridge ready", () => {
    enqueueCallV3NativeEvent({
      callId: "call-1",
      action: "accept",
      source: "native_notification_accept",
    });
    markCallV3NativeBridgeReady();
    enqueueCallV3NativeEvent({
      callId: "call-1",
      action: "accept",
      source: "native_notification_accept",
    });

    const replayLogs = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_replay");
    expect(replayLogs).toHaveLength(1);
    expect(replayLogs[0]?.[2]).toMatchObject({ callId: "call-1", action: "accept" });
  });
});
