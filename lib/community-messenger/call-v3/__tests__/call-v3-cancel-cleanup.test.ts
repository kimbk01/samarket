import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  patchCancel: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3PatchCancel: apiMocks.patchCancel,
}));

import { callV3Cancel } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { cleanupCallV3 } from "@/lib/community-messenger/call-v3/call-v3-cleanup";
import { resetCallV3PatchClaimsForTests } from "@/lib/community-messenger/call-v3/call-v3-patch-guard";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-cancel-cleanup", () => {
  beforeEach(() => {
    resetCallV3PatchClaimsForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.patchCancel.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("patches cancel once and returns store to idle", async () => {
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
      canReceiveNewCall: true,
    });

    const replace = vi.fn();
    await callV3Cancel("call-1", { replace });

    expect(apiMocks.patchCancel).toHaveBeenCalledTimes(1);
    expect(apiMocks.patchCancel).toHaveBeenCalledWith("call-1");
    expect(replace).toHaveBeenCalled();

    const state = useCallV3Store.getState();
    expect(state.phase).toBe("idle");
    expect(state.canStartNewCall).toBe(true);
  });

  it("does not double-cancel patch", async () => {
    useCallV3Store.setState({ phase: "outgoing_ringing" });
    const replace = vi.fn();
    await callV3Cancel("call-1", { replace });
    await callV3Cancel("call-1", { replace });
    expect(apiMocks.patchCancel).toHaveBeenCalledTimes(1);
  });

  it("cleanup returns idle capabilities", async () => {
    useCallV3Store.setState({
      phase: "outgoing_ringing",
      canStartNewCall: false,
      canReceiveNewCall: false,
    });
    await cleanupCallV3("call-2", "cancelled");
    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canStartNewCall).toBe(true);
    expect(useCallV3Store.getState().canReceiveNewCall).toBe(true);
  });
});
