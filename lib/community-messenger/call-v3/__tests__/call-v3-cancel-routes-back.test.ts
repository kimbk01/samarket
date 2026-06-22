import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  patchCancel: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3PatchCancel: apiMocks.patchCancel,
}));

import { callV3Cancel } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { resetCallV3PatchClaimsForTests } from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

function stubCallV3ScreenWindow(pathname: string): void {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { pathname, search: "", assign: vi.fn() },
  });
  vi.stubGlobal("sessionStorage", {
    setItem: (k: string, v: string) => storage.set(k, v),
    getItem: (k: string) => storage.get(k) ?? null,
    removeItem: (k: string) => storage.delete(k),
  });
  sessionStorage.setItem("samarket.cm.call_v3_return_path.v1", "/community-messenger/rooms/room-1");
}

describe("call-v3-cancel-routes-back", () => {
  beforeEach(() => {
    resetCallV3PatchClaimsForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.patchCancel.mockClear();
    vi.unstubAllGlobals();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("routes back to remembered room path after cancel cleanup", async () => {
    stubCallV3ScreenWindow("/community-messenger/calls/call-1");
    useCallV3Store.setState({
      phase: "outgoing_ringing",
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
    });

    const replace = vi.fn();
    await callV3Cancel("call-1", { replace });

    expect(apiMocks.patchCancel).toHaveBeenCalledWith("call-1");
    expect(replace).toHaveBeenCalledWith("/community-messenger/rooms/room-1");
    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canStartNewCall).toBe(true);
  });
});
