import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeInflight = vi.hoisted(() => ({
  isInflight: false,
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-native-accept-flight", () => ({
  isNativeAcceptInflight: (callId: string) =>
    nativeInflight.isInflight && callId.trim() === "call-accept",
}));

const exitMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/community-messenger/call-v4/call-v4-route", () => ({
  exitCallV4ScreenAfterCleanup: (...args: unknown[]) => exitMock(...args),
}));

import {
  clearCallV4WebCallScreenReady,
  isCallV4WebCallScreenReady,
  markCallV4WebCallScreenReady,
  maybeExitCallV4ScreenAfterCleanup,
  resetCallV4WebCallScreenReadyForTests,
  shouldDeferCallV4ExitUntilScreenReady,
} from "@/lib/community-messenger/call-v4/call-v4-exit-guard";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("call-v4 exit guard", () => {
  beforeEach(() => {
    resetCallV4WebCallScreenReadyForTests();
    nativeInflight.isInflight = false;
    exitMock.mockReset();
    useCallV4Store.getState().resetToIdle();
  });

  it("defers ended exit while native accept inflight before screen ready", () => {
    nativeInflight.isInflight = true;
    useCallV4Store.getState().setPhase("joining");

    expect(
      shouldDeferCallV4ExitUntilScreenReady({
        callId: "call-accept",
        reason: "ended",
        phase: "joining",
      }),
    ).toBe(true);
    maybeExitCallV4ScreenAfterCleanup("call-accept", "ended");
    expect(exitMock).not.toHaveBeenCalled();
  });

  it("allows rejected exit before screen ready", () => {
    nativeInflight.isInflight = true;
    useCallV4Store.getState().setPhase("joining");

    expect(
      shouldDeferCallV4ExitUntilScreenReady({
        callId: "call-accept",
        reason: "rejected",
        phase: "joining",
      }),
    ).toBe(false);
    maybeExitCallV4ScreenAfterCleanup("call-accept", "rejected");
    expect(exitMock).toHaveBeenCalledTimes(1);
  });

  it("allows ended exit after connecting handoff marked ready", () => {
    nativeInflight.isInflight = true;
    markCallV4WebCallScreenReady("call-accept", "connecting");
    expect(isCallV4WebCallScreenReady("call-accept")).toBe(true);

    expect(
      shouldDeferCallV4ExitUntilScreenReady({
        callId: "call-accept",
        reason: "ended",
        phase: "joining",
      }),
    ).toBe(false);
    maybeExitCallV4ScreenAfterCleanup("call-accept", "ended");
    expect(exitMock).toHaveBeenCalledTimes(1);
  });

  it("clears screen-ready markers on cleanup path", () => {
    markCallV4WebCallScreenReady("call-1", "connected");
    clearCallV4WebCallScreenReady("call-1");
    expect(isCallV4WebCallScreenReady("call-1")).toBe(false);
  });
});
