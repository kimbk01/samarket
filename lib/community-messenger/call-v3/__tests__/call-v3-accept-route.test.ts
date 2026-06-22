import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  accept: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3PatchAccept: apiMocks.accept,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-ringtone", () => ({
  stopCallV3Ringtone: vi.fn(),
}));

import { callV3Accept } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { resetCallV3PatchClaimsForTests } from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-accept-route", () => {
  beforeEach(() => {
    resetCallV3PatchClaimsForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.accept.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("accepts once and routes to primary calls screen", async () => {
    useCallV3Store.setState({
      phase: "incoming_ringing",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "incoming",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
    });

    const push = vi.fn();
    await callV3Accept("call-1", { push });
    await callV3Accept("call-1", { push });

    expect(apiMocks.accept).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/community-messenger/calls/call-1");
    expect(useCallV3Store.getState().phase).toBe("joining");
  });
});
