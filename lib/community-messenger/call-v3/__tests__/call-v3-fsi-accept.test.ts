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
  callV3FetchSession: vi.fn(async () => null),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-route", () => ({
  readCallV3ExitRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import {
  handleCallV3NativeCallRoute,
  markCallV3NativeBridgeReady,
  resetCallV3NativeBridgeForTests,
} from "@/lib/community-messenger/call-v3/call-v3-native-bridge";

describe("call-v3-fsi-accept", () => {
  beforeEach(() => {
    resetCallV3NativeBridgeForTests();
    actionMocks.accept.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("FSI accept route logs native_notification_accept and replays accept once", async () => {
    handleCallV3NativeCallRoute(
      "/community-messenger/calls/call-fsi-1?action=accept&source=activity",
    );

    const acceptLogs = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_notification_accept");
    expect(acceptLogs).toHaveLength(1);
    expect(acceptLogs[0]?.[2]).toMatchObject({
      callId: "call-fsi-1",
      source: "native_activity_accept",
    });

    markCallV3NativeBridgeReady();
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.accept).toHaveBeenCalledTimes(1);
    expect(actionMocks.accept).toHaveBeenCalledWith(
      "call-fsi-1",
      expect.objectContaining({ push: expect.any(Function) }),
    );
  });

  it("queues accept before bridge ready and replays once", async () => {
    handleCallV3NativeCallRoute(
      "/community-messenger/calls/call-fsi-2?action=accept&nativePrep=1&source=activity",
    );
    expect(actionMocks.accept).not.toHaveBeenCalled();

    markCallV3NativeBridgeReady();
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.accept).toHaveBeenCalledTimes(1);
  });
});
