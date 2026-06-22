import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  patchEnd: vi.fn(async () => ({ ok: true })),
}));

const agoraMocks = vi.hoisted(() => ({
  leave: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3PatchEnd: apiMocks.patchEnd,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: vi.fn(),
  leaveCallV3Agora: agoraMocks.leave,
}));

import { callV3End } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { resetCallV3PatchClaimsForTests } from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

function stubCallV3ScreenWindow(): void {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { pathname: "/community-messenger/calls-v3/call-1", search: "", assign: vi.fn() },
  });
  vi.stubGlobal("sessionStorage", {
    setItem: (k: string, v: string) => storage.set(k, v),
    getItem: (k: string) => storage.get(k) ?? null,
    removeItem: (k: string) => storage.delete(k),
  });
  sessionStorage.setItem("samarket.cm.call_v3_return_path.v1", "/community-messenger/rooms/room-1");
}

describe("call-v3-end-routes-back", () => {
  beforeEach(() => {
    resetCallV3PatchClaimsForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.patchEnd.mockClear();
    agoraMocks.leave.mockClear();
    vi.unstubAllGlobals();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("routes back to remembered room path after end cleanup", async () => {
    stubCallV3ScreenWindow();
    useCallV3Store.setState({
      phase: "connected",
      connectedAt: Date.now() - 5_000,
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
      canStartNewCall: false,
      canReceiveNewCall: false,
    });

    const replace = vi.fn();
    await callV3End("call-1", { replace });

    expect(apiMocks.patchEnd).toHaveBeenCalledWith("call-1", { durationSeconds: expect.any(Number) });
    expect(replace).toHaveBeenCalledWith("/community-messenger/rooms/room-1");
    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canStartNewCall).toBe(true);
  });
});
