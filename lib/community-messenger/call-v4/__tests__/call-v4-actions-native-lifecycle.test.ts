import { beforeEach, describe, expect, it, vi } from "vitest";

const lifecycleMocks = vi.hoisted(() => ({
  onAccept: vi.fn(),
  onReject: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-native-lifecycle", () => ({
  syncCallV4NativeOnWebAccept: (...args: unknown[]) => lifecycleMocks.onAccept(...args),
  syncCallV4NativeOnWebReject: (...args: unknown[]) => lifecycleMocks.onReject(...args),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4PatchAccept: vi.fn(async () => ({ ok: true })),
  callV4PatchReject: vi.fn(async () => ({ ok: true })),
  callV4FetchSession: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-agora", () => ({
  joinCallV4Agora: vi.fn(async () => true),
  leaveCallV4Agora: vi.fn(async () => {}),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-cleanup", () => ({
  cleanupCallV4: (...args: unknown[]) => lifecycleMocks.cleanup(...args),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-route", () => ({
  rememberCallV4ReturnPath: vi.fn(),
  buildCallV4ScreenHref: vi.fn(() => "/community-messenger/calls-v4/call-hook"),
  exitCallV4ScreenAfterCleanup: vi.fn(),
  readCallV4ExitRouter: vi.fn(() => null),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-patch-guard", () => ({
  claimCallV4AcceptPatchOnce: vi.fn(() => true),
  claimCallV4RejectPatchOnce: vi.fn(() => true),
  claimCallV4EndPatchOnce: vi.fn(() => true),
  claimCallV4CancelPatchOnce: vi.fn(() => true),
  releaseCallV4CancelPatchClaim: vi.fn(),
}));

import {
  callV4Accept,
  callV4HandleRemoteTerminal,
  callV4Reject,
  resetCallV4RemoteTerminalClaimsForTests,
} from "@/lib/community-messenger/call-v4/call-v4-actions";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("call-v4 actions native lifecycle hooks", () => {
  beforeEach(() => {
    lifecycleMocks.onAccept.mockReset();
    lifecycleMocks.onReject.mockReset();
    lifecycleMocks.cleanup.mockReset();
    lifecycleMocks.cleanup.mockResolvedValue(undefined);
    resetCallV4RemoteTerminalClaimsForTests();
    useCallV4Store.getState().resetToIdle();
    useCallV4Store.getState().setIdentity({
      callId: "call-hook",
      roomId: "room-1",
      callerUserId: "u-a",
      calleeUserId: "u-b",
      direction: "incoming",
      mediaType: "audio",
      createdAt: new Date().toISOString(),
    });
    useCallV4Store.getState().setPhase("incoming_ringing");
  });

  it("callV4Accept invokes native sync at accept entry", async () => {
    const router = { push: vi.fn(), replace: vi.fn() };
    await callV4Accept("call-hook", router, { skipRoute: true, source: "sheet" });
    expect(lifecycleMocks.onAccept).toHaveBeenCalledTimes(1);
    expect(lifecycleMocks.onAccept).toHaveBeenCalledWith("call-hook");
  });

  it("callV4Reject invokes native sync at start", async () => {
    await callV4Reject("call-hook");
    expect(lifecycleMocks.onReject).toHaveBeenCalledWith("call-hook");
  });

  it("remote terminal allows route callId during connected hydrate gap and finalizes once", async () => {
    useCallV4Store.getState().setIdentity(null);
    useCallV4Store.setState({ phase: "connected", connectedAt: Date.now() });
    vi.stubGlobal("window", {
      location: {
        pathname: "/community-messenger/calls-v4/call-route",
        search: "",
      },
      sessionStorage: {
        getItem: vi.fn(() => null),
        removeItem: vi.fn(),
      },
    });

    await callV4HandleRemoteTerminal("call-route", "ended", undefined, "poll");
    await callV4HandleRemoteTerminal("call-route", "ended", undefined, "agora");

    expect(lifecycleMocks.cleanup).toHaveBeenCalledTimes(1);
    expect(lifecycleMocks.cleanup).toHaveBeenCalledWith("call-route", "ended");
    vi.unstubAllGlobals();
  });
});
