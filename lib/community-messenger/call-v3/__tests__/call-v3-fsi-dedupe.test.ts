import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

const actionMocks = vi.hoisted(() => ({
  accept: vi.fn(async () => undefined),
  reject: vi.fn(async () => undefined),
  incomingDiscovered: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-actions", () => ({
  callV3Accept: actionMocks.accept,
  callV3Reject: actionMocks.reject,
  callV3IncomingDiscovered: actionMocks.incomingDiscovered,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3FetchSession: vi.fn(async () => ({
    id: "call-dedupe",
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "a",
    recipientUserId: "b",
    peerUserId: "a",
    peerLabel: "A",
    callKind: "voice",
    status: "ringing",
    startedAt: "2026-06-23T00:00:00.000Z",
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
  })),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-route", () => ({
  readCallV3ExitRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import {
  handleCallV3NativeCallRoute,
  markCallV3NativeBridgeReady,
  resetCallV3NativeBridgeForTests,
} from "@/lib/community-messenger/call-v3/call-v3-native-bridge";

describe("call-v3-fsi-dedupe", () => {
  beforeEach(() => {
    resetCallV3NativeBridgeForTests();
    actionMocks.accept.mockClear();
    actionMocks.reject.mockClear();
    actionMocks.incomingDiscovered.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dedupes duplicate FSI accept routes for same callId", async () => {
    const path = "/community-messenger/calls/call-dedupe?action=accept&source=activity";
    handleCallV3NativeCallRoute(path);
    handleCallV3NativeCallRoute(path);

    markCallV3NativeBridgeReady();
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.accept).toHaveBeenCalledTimes(1);
    const skipped = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_replay_skipped_duplicate");
    expect(skipped.length).toBeGreaterThanOrEqual(1);
  });

  it("dedupes duplicate wake routes for same callId (FSI + notification)", async () => {
    const path = "/community-messenger/calls/call-dedupe?source=native_push";
    handleCallV3NativeCallRoute(path);
    handleCallV3NativeCallRoute(path);

    markCallV3NativeBridgeReady();
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.incomingDiscovered).toHaveBeenCalledTimes(1);
  });
});
