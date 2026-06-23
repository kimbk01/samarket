import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

const actionMocks = vi.hoisted(() => ({
  accept: vi.fn(async () => undefined),
  incomingDiscovered: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-actions", () => ({
  callV3Accept: actionMocks.accept,
  callV3IncomingDiscovered: actionMocks.incomingDiscovered,
  callV3Reject: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3FetchSession: vi.fn(async () => ({
    id: "call-tap",
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

describe("call-v3-fsi-multitap", () => {
  beforeEach(() => {
    resetCallV3NativeBridgeForTests();
    actionMocks.accept.mockClear();
    actionMocks.incomingDiscovered.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rapid accept taps after bridge ready only PATCH once", async () => {
    markCallV3NativeBridgeReady();

    const path = "/community-messenger/calls/call-tap?action=accept&source=activity";
    handleCallV3NativeCallRoute(path);
    handleCallV3NativeCallRoute(path);
    handleCallV3NativeCallRoute(path);

    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.accept).toHaveBeenCalledTimes(1);
  });

  it("wake then accept only runs accept replay once when accept tapped multiple times", async () => {
    handleCallV3NativeCallRoute("/community-messenger/calls/call-tap?source=native_push");
    markCallV3NativeBridgeReady();
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.incomingDiscovered).toHaveBeenCalledTimes(1);

    const acceptPath = "/community-messenger/calls/call-tap?action=accept&source=activity";
    handleCallV3NativeCallRoute(acceptPath);
    handleCallV3NativeCallRoute(acceptPath);
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.accept).toHaveBeenCalledTimes(1);
  });
});
