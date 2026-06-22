import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveCallSessionCallId,
  resetActiveCallSessionForTests,
  setActiveCallSession,
  syncClearActiveCallSessionLocal,
} from "@/lib/call/active-call-session";
import {
  acquireCallActionLock,
  bindCallActionLockCallId,
  isOutgoingCallStartBlocked,
  releaseCallActionLockForCallId,
  resetCallActionLockForTests,
} from "@/lib/call/call-action-lock";
import { syncTerminalCallClientState } from "@/lib/call/call-terminal-sync-cleanup";

vi.mock("@/lib/community-messenger/call-orchestrator", () => ({
  logDibayCall: vi.fn(),
  sealDibayCallTerminalSurface: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  stopCommunityMessengerCallTone: vi.fn(),
}));

vi.mock("@/lib/call/native/call-heartbeat-watchdog", () => ({
  stopCallHeartbeatWatchdog: vi.fn(),
}));

describe("call-terminal-sync-cleanup", () => {
  beforeEach(() => {
    resetActiveCallSessionForTests();
    resetCallActionLockForTests();
  });

  it("syncTerminalCallClientState clears active session and releases matching lock", () => {
    setActiveCallSession({
      callId: "call-a",
      roomId: "room-1",
      peerUserId: null,
      role: "caller",
      mediaType: "voice",
      phase: "ringing",
    });
    acquireCallActionLock({ roomId: "room-1", mediaType: "voice" });
    bindCallActionLockCallId("call-a");

    expect(syncTerminalCallClientState("call-a", "cancelled")).toBe(true);
    expect(getActiveCallSessionCallId()).toBeNull();
    expect(isOutgoingCallStartBlocked()).toBe(false);
  });

  it("does not clear a different live callId", () => {
    setActiveCallSession({
      callId: "live-b",
      roomId: "room-2",
      peerUserId: null,
      role: "caller",
      mediaType: "voice",
      phase: "active",
      machinePhase: "CONNECTED",
      connected: true,
    });
    acquireCallActionLock({ roomId: "room-2", mediaType: "voice" });
    bindCallActionLockCallId("live-b");

    expect(syncTerminalCallClientState("old-a", "ended")).toBe(false);
    expect(getActiveCallSessionCallId()).toBe("live-b");
    expect(isOutgoingCallStartBlocked()).toBe(true);
  });

  it("releaseCallActionLockForCallId ignores mismatched bound callId", () => {
    acquireCallActionLock({ roomId: "room-1", mediaType: "voice" });
    bindCallActionLockCallId("call-x");

    releaseCallActionLockForCallId("call-y", "terminal");
    expect(isOutgoingCallStartBlocked()).toBe(true);

    releaseCallActionLockForCallId("call-x", "terminal");
    expect(isOutgoingCallStartBlocked()).toBe(false);
  });

  it("syncClearActiveCallSessionLocal blocks forbidden cleanup reason", () => {
    setActiveCallSession({
      callId: "call-3",
      roomId: "room-1",
      peerUserId: null,
      role: "caller",
      mediaType: "voice",
      phase: "active",
      machinePhase: "CONNECTED",
      connected: true,
    });
    expect(syncClearActiveCallSessionLocal("call-3", "activity_destroyed")).toBe(false);
    expect(getActiveCallSessionCallId()).toBe("call-3");
  });
});
