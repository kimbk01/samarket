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
  callV4PatchAccept: vi.fn(async () => ({ ok: true, session: { status: "active" } })),
  callV4PatchReject: vi.fn(async () => ({ ok: true })),
  callV4FetchSession: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-agora", () => ({
  joinCallV4Agora: vi.fn(async () => true),
  leaveCallV4Agora: vi.fn(async () => {}),
}));

import { callV4PatchAccept } from "@/lib/community-messenger/call-v4/call-v4-api";
import { joinCallV4Agora } from "@/lib/community-messenger/call-v4/call-v4-agora";

vi.mock("@/lib/community-messenger/call-v4/call-v4-cleanup", () => ({
  cleanupCallV4: (...args: unknown[]) => lifecycleMocks.cleanup(...args),
}));

vi.mock("@/lib/community-messenger/call-session-navigation-seed", () => ({
  pinCommunityMessengerCallTerminalSurfaceDismiss: vi.fn(),
}));

vi.mock("@/lib/call/active-call-session", () => ({
  hardClearActiveCallSession: vi.fn(async () => {}),
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
  hasCallV4AcceptPatchDone: vi.fn(() => false),
  markCallV4AcceptPatchDone: vi.fn(),
  releaseCallV4AcceptPatchClaim: vi.fn(),
  tryClaimCallV4AcceptFlight: vi.fn(() => true),
  releaseCallV4AcceptFlightClaim: vi.fn(),
}));

import { hardClearActiveCallSession } from "@/lib/call/active-call-session";
import {
  callV4Accept,
  callV4HandleRemoteTerminal,
  callV4Reject,
  resetCallV4RemoteTerminalClaimsForTests,
} from "@/lib/community-messenger/call-v4/call-v4-actions";
import { pinCommunityMessengerCallTerminalSurfaceDismiss } from "@/lib/community-messenger/call-session-navigation-seed";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("call-v4 actions native lifecycle hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callV4PatchAccept).mockResolvedValue({ ok: true, session: { status: "active" } as never });
    vi.mocked(joinCallV4Agora).mockResolvedValue(true);
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

  it("callV4Accept logs call_v4_accept_enter before accept_click", async () => {
    const logs: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      if (args[0] === "[DIBAY_CALL_V4]" && typeof args[1] === "string") {
        logs.push(args[1]);
      }
      originalInfo(...args);
    };
    try {
      const router = { push: vi.fn(), replace: vi.fn() };
      await callV4Accept("call-hook", router, { skipRoute: true, source: "sheet" });
      expect(logs.indexOf("call_v4_accept_enter")).toBeLessThan(logs.indexOf("accept_click"));
    } finally {
      console.info = originalInfo;
    }
  });

  it("callV4Accept awaits patch before agora join", async () => {
    const order: string[] = [];
    vi.mocked(callV4PatchAccept).mockImplementation(async () => {
      order.push("patch");
      return { ok: true, session: { status: "active" } as never };
    });
    vi.mocked(joinCallV4Agora).mockImplementation(async () => {
      order.push("join");
      return true;
    });

    const router = { push: vi.fn(), replace: vi.fn() };
    await callV4Accept("call-hook", router, { skipRoute: true, source: "sheet" });

    expect(order).toEqual(["patch", "join"]);
    expect(joinCallV4Agora).toHaveBeenCalledWith("call-hook", { afterPatch: true });
  });

  it("native accept handoff skips web patch and joins agora", async () => {
    const router = { push: vi.fn(), replace: vi.fn() };
    await callV4Accept("call-hook", router, { skipRoute: true, source: "native_accept" });

    expect(callV4PatchAccept).not.toHaveBeenCalled();
    expect(joinCallV4Agora).toHaveBeenCalledWith("call-hook", { afterPatch: true });
  });

  it("callV4Reject invokes native sync at start", async () => {
    await callV4Reject("call-hook");
    expect(lifecycleMocks.onReject).toHaveBeenCalledWith("call-hook");
  });

  it("releases outgoing gate after remote_terminal_finalize before cleanup completes", async () => {
    useCallV4Store.setState({
      phase: "connected",
      connectedAt: Date.now(),
      canStartNewCall: false,
      identity: {
        callId: "call-hook",
        roomId: "room-1",
        callerUserId: "u-a",
        calleeUserId: "u-b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
    });

    lifecycleMocks.cleanup.mockImplementation(async () => {
      expect(useCallV4Store.getState().canStartNewCall).toBe(true);
    });

    await callV4HandleRemoteTerminal("call-hook", "ended", undefined, "poll");

    expect(useCallV4Store.getState().canStartNewCall).toBe(true);
    expect(lifecycleMocks.cleanup).toHaveBeenCalledWith("call-hook", "ended");
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
    expect(pinCommunityMessengerCallTerminalSurfaceDismiss).toHaveBeenCalledWith("call-route");
    expect(hardClearActiveCallSession).toHaveBeenCalledWith("call-route", "call_v4_terminal_finalize");
    vi.unstubAllGlobals();
  });
});
