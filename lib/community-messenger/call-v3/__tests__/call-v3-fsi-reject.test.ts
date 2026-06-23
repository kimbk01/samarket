import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

const actionMocks = vi.hoisted(() => ({
  reject: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-actions", () => ({
  callV3Reject: actionMocks.reject,
  callV3Accept: vi.fn(),
  callV3IncomingDiscovered: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3FetchSession: vi.fn(async () => null),
}));

import {
  handleCallV3NativeCallRoute,
  markCallV3NativeBridgeReady,
  resetCallV3NativeBridgeForTests,
} from "@/lib/community-messenger/call-v3/call-v3-native-bridge";

describe("call-v3-fsi-reject", () => {
  beforeEach(() => {
    resetCallV3NativeBridgeForTests();
    actionMocks.reject.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("FSI reject route logs native_notification_reject and replays reject once", async () => {
    handleCallV3NativeCallRoute(
      "/community-messenger/calls/call-fsi-r1?action=reject&source=activity",
    );

    const rejectLogs = vi
      .mocked(console.info)
      .mock.calls.filter((call) => call[1] === "native_notification_reject");
    expect(rejectLogs).toHaveLength(1);
    expect(rejectLogs[0]?.[2]).toMatchObject({
      callId: "call-fsi-r1",
      source: "native_activity_reject",
    });

    markCallV3NativeBridgeReady();
    await new Promise((r) => setTimeout(r, 0));

    expect(actionMocks.reject).toHaveBeenCalledTimes(1);
    expect(actionMocks.reject).toHaveBeenCalledWith("call-fsi-r1");
  });
});
