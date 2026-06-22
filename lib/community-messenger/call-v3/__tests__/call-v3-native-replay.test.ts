import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const actionMocks = vi.hoisted(() => ({
  incomingDiscovered: vi.fn(),
}));

const apiMocks = vi.hoisted(() => ({
  fetchSession: vi.fn(async () => ({
    id: "call-1",
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "user-a",
    recipientUserId: "user-b",
    peerUserId: "user-a",
    peerLabel: "Peer",
    callKind: "voice",
    status: "ringing",
    startedAt: "2026-06-23T00:00:00.000Z",
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
  })),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-actions", () => ({
  callV3IncomingDiscovered: actionMocks.incomingDiscovered,
  callV3Accept: vi.fn(),
  callV3Reject: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3FetchSession: apiMocks.fetchSession,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-route", () => ({
  readCallV3ExitRouter: () => null,
}));

import {
  enqueueCallV3NativeNotificationWake,
  handleCallV3NotificationRouteWake,
  markCallV3NativeBridgeReady,
  resetCallV3NativeBridgeForTests,
} from "@/lib/community-messenger/call-v3/call-v3-native-bridge";

describe("call-v3-native-replay", () => {
  beforeEach(() => {
    resetCallV3NativeBridgeForTests();
    actionMocks.incomingDiscovered.mockClear();
    apiMocks.fetchSession.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores wake pending before bridge ready and replays once", async () => {
    enqueueCallV3NativeNotificationWake({
      callId: "call-1",
      source: "native_push_wake",
      path: "/community-messenger/calls/call-1?source=native_push",
    });

    const storeLogs = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_pending_store");
    expect(storeLogs).toHaveLength(1);
    expect(actionMocks.incomingDiscovered).not.toHaveBeenCalled();

    markCallV3NativeBridgeReady();
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.incomingDiscovered).toHaveBeenCalledTimes(1);
    const replayDone = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_replay_done");
    expect(replayDone.length).toBeGreaterThanOrEqual(1);
  });

  it("dedupes duplicate notification taps for same callId", async () => {
    enqueueCallV3NativeNotificationWake({
      callId: "call-1",
      source: "native_notification_wake",
    });
    enqueueCallV3NativeNotificationWake({
      callId: "call-1",
      source: "native_notification_wake",
    });

    markCallV3NativeBridgeReady();
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.incomingDiscovered).toHaveBeenCalledTimes(1);
    const skipped = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_replay_skipped_duplicate");
    expect(skipped.length).toBeGreaterThanOrEqual(1);
  });

  it("logs native_notification_click on wake enqueue", () => {
    enqueueCallV3NativeNotificationWake({
      callId: "call-9",
      source: "native_push_wake",
    });
    const clickLogs = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_notification_click");
    expect(clickLogs).toHaveLength(1);
    expect(clickLogs[0]?.[2]).toMatchObject({ callId: "call-9" });
  });

  it("call-route URL loads → native_pending_store → provider ready replays once", async () => {
    const ok = handleCallV3NotificationRouteWake(
      "/community-messenger/calls/call-1?source=native_resume",
      { source: "notification_tap" },
    );
    expect(ok).toBe(true);

    const storeLogs = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_pending_store");
    expect(storeLogs).toHaveLength(1);
    expect(storeLogs[0]?.[2]).toMatchObject({ callId: "call-1", source: "notification_tap" });

    markCallV3NativeBridgeReady();
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.incomingDiscovered).toHaveBeenCalledTimes(1);
    const replayLogs = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_pending_replay");
    expect(replayLogs).toHaveLength(1);
    const replayDone = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_replay_done");
    expect(replayDone.length).toBeGreaterThanOrEqual(1);
  });

  it("duplicate notification route wake enqueues replay once", async () => {
    handleCallV3NotificationRouteWake("/community-messenger/calls/call-1?source=native_resume", {
      source: "notification_tap",
    });
    handleCallV3NotificationRouteWake("/community-messenger/calls/call-1?source=native_resume", {
      source: "notification_tap",
    });

    markCallV3NativeBridgeReady();
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.incomingDiscovered).toHaveBeenCalledTimes(1);
  });
});
