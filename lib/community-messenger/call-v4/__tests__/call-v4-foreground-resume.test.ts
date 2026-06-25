import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCallV4ForegroundResumeRestore,
  buildCallV4ForegroundResumeDedupeKey,
  evaluateCallV4ForegroundResume,
} from "@/lib/community-messenger/call-v4/call-v4-foreground-resume";

const expandDock = vi.fn();

vi.mock("@/lib/community-messenger/call-presentation-ownership", () => ({
  expandCommunityCallFromDock: (...args: unknown[]) => expandDock(...args),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-flag", () => ({
  isCallV4TelegramLaneEnabled: () => true,
}));

vi.mock("@/lib/community-messenger/call-active-session-recovery", () => ({
  readTerminalCallRecoverySuppress: () => null,
}));

vi.mock("@/lib/community-messenger/incoming-call-state", () => ({
  readCallConsumedReason: () => null,
}));

describe("call-v4-foreground-resume", () => {
  beforeEach(() => {
    expandDock.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("restores when connected, native call exists, and not on calls-v4 path", () => {
    const decision = evaluateCallV4ForegroundResume({
      laneEnabled: true,
      phase: "connected",
      pathname: "/community-messenger",
      storeCallId: "call-abc",
      nativeCallId: "call-abc",
      nativeSnapshot: { callId: "call-abc", phase: "CONNECTED", mediaType: "video", connected: true },
      dedupeKey: "call-abc:/community-messenger",
      lastRestoreKey: null,
    });
    expect(decision.action).toBe("restore");
    if (decision.action === "restore") {
      expect(decision.href).toContain("/community-messenger/calls-v4/call-abc");
      expect(decision.href).toContain("foreground_resume");
    }
  });

  it("skips when already on dedicated calls-v4 path", () => {
    const decision = evaluateCallV4ForegroundResume({
      phase: "connected",
      pathname: "/community-messenger/calls-v4/call-abc",
      storeCallId: "call-abc",
      nativeCallId: "call-abc",
      nativeSnapshot: { callId: "call-abc", phase: "CONNECTED", mediaType: "video", connected: true },
      dedupeKey: null,
      lastRestoreKey: null,
    });
    expect(decision).toEqual({ action: "skip", reason: "already_on_call_screen", callId: "call-abc" });
  });

  it("skips when phase is not connected", () => {
    const decision = evaluateCallV4ForegroundResume({
      phase: "joining",
      pathname: "/community-messenger",
      storeCallId: "call-abc",
      nativeCallId: "call-abc",
      nativeSnapshot: { callId: "call-abc", phase: "CONNECTED", mediaType: "video", connected: true },
      dedupeKey: null,
      lastRestoreKey: null,
    });
    expect(decision).toEqual({ action: "skip", reason: "not_connected", callId: "call-abc" });
  });

  it("skips when native active call is missing", () => {
    const decision = evaluateCallV4ForegroundResume({
      phase: "connected",
      pathname: "/community-messenger",
      storeCallId: "call-abc",
      nativeCallId: null,
      nativeSnapshot: null,
      dedupeKey: null,
      lastRestoreKey: null,
    });
    expect(decision).toEqual({ action: "skip", reason: "no_active_call", callId: "call-abc" });
  });

  it("skips duplicate restore for same callId and pathname", () => {
    const key = buildCallV4ForegroundResumeDedupeKey("call-abc", "/community-messenger");
    const decision = evaluateCallV4ForegroundResume({
      phase: "connected",
      pathname: "/community-messenger",
      storeCallId: "call-abc",
      nativeCallId: "call-abc",
      nativeSnapshot: { callId: "call-abc", phase: "CONNECTED", mediaType: "video", connected: true },
      dedupeKey: key,
      lastRestoreKey: key,
    });
    expect(decision).toEqual({ action: "skip", reason: "duplicate_restore", callId: "call-abc" });
  });

  it("applyCallV4ForegroundResumeRestore expands dock before route", () => {
    applyCallV4ForegroundResumeRestore({
      callId: "call-abc",
      href: "/community-messenger/calls-v4/call-abc?source=foreground_resume",
      trigger: "test",
    });
    expect(expandDock).toHaveBeenCalledWith("call-abc");
  });
});
