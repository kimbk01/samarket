import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveCallSessionCallId,
  hardClearActiveCallSession,
  resetActiveCallSessionForTests,
  setActiveCallSession,
} from "@/lib/call/active-call-session";
import {
  endNativeCallService,
  reportNativeCallRemoteEnded,
} from "@/lib/call/native/native-call-service";
import {
  acquireCallActionLock,
  bindCallActionLockCallId,
  isOutgoingCallStartBlocked,
  releaseCallActionLock,
  resetCallActionLockForTests,
} from "@/lib/call/call-action-lock";

vi.mock("@/lib/community-messenger/call-orchestrator", () => ({
  logDibayCall: vi.fn(),
  sealDibayCallTerminalSurface: vi.fn(),
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  endNativeCallService: vi.fn(async () => true),
  reportNativeCallRemoteEnded: vi.fn(async () => true),
}));

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  stopCommunityMessengerCallTone: vi.fn(),
}));

vi.mock("@/lib/call/native/call-heartbeat-watchdog", () => ({
  stopCallHeartbeatWatchdog: vi.fn(),
}));

describe("active-call-session SSOT", () => {
  beforeEach(() => {
    resetActiveCallSessionForTests();
    resetCallActionLockForTests();
  });

  it("keeps a single live callId", () => {
    setActiveCallSession({
      callId: "call-1",
      roomId: "room-1",
      peerUserId: "peer-1",
      role: "caller",
      mediaType: "voice",
      phase: "dialing",
    });
    expect(getActiveCallSessionCallId()).toBe("call-1");
  });

  it("hard clears terminal session via remote native bridge", async () => {
    setActiveCallSession({
      callId: "call-2",
      roomId: "room-1",
      peerUserId: null,
      role: "caller",
      mediaType: "voice",
      phase: "active",
      machinePhase: "CONNECTED",
      connected: true,
    });
    await hardClearActiveCallSession("call-2", "ended");
    expect(getActiveCallSessionCallId()).toBeNull();
    expect(vi.mocked(reportNativeCallRemoteEnded)).toHaveBeenCalledWith("call-2");
    expect(vi.mocked(endNativeCallService)).not.toHaveBeenCalled();
  });

  it("hard clears local end via endNativeCallService", async () => {
    setActiveCallSession({
      callId: "call-2b",
      roomId: "room-1",
      peerUserId: null,
      role: "caller",
      mediaType: "voice",
      phase: "active",
      machinePhase: "CONNECTED",
      connected: true,
    });
    vi.mocked(endNativeCallService).mockClear();
    vi.mocked(reportNativeCallRemoteEnded).mockClear();
    await hardClearActiveCallSession("call-2b", "local_ended");
    expect(getActiveCallSessionCallId()).toBeNull();
    expect(vi.mocked(endNativeCallService)).toHaveBeenCalledWith("call-2b", "local_ended");
    expect(vi.mocked(reportNativeCallRemoteEnded)).not.toHaveBeenCalled();
  });

  it("blocks forbidden cleanup reason", async () => {
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
    await hardClearActiveCallSession("call-3", "activity_destroyed");
    expect(getActiveCallSessionCallId()).toBe("call-3");
  });
});

describe("call-action-lock", () => {
  beforeEach(() => {
    resetActiveCallSessionForTests();
    resetCallActionLockForTests();
  });

  it("blocks second acquire while lock is held", () => {
    const first = acquireCallActionLock({ roomId: "room-a", mediaType: "voice" });
    expect(first.ok).toBe(true);
    const second = acquireCallActionLock({ roomId: "room-b", mediaType: "voice" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("lock_held");
  });

  it("blocks outgoing when active session exists", () => {
    setActiveCallSession({
      callId: "live-1",
      roomId: "room-1",
      peerUserId: null,
      role: "caller",
      mediaType: "voice",
      phase: "ringing",
    });
    expect(isOutgoingCallStartBlocked()).toBe(true);
    const result = acquireCallActionLock({ roomId: "room-2", mediaType: "voice" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("active_call");
  });

  it("releases lock after failure path", () => {
    acquireCallActionLock({ roomId: "room-a", mediaType: "voice" });
    releaseCallActionLock("create_failed");
    expect(isOutgoingCallStartBlocked()).toBe(false);
  });

  it("hard clear via finalize releases outgoing start lock", async () => {
    acquireCallActionLock({ roomId: "room-a", mediaType: "voice" });
    bindCallActionLockCallId("call-finalize");
    setActiveCallSession({
      callId: "call-finalize",
      roomId: "room-a",
      peerUserId: null,
      role: "caller",
      mediaType: "voice",
      phase: "active",
      machinePhase: "CONNECTED",
      connected: true,
    });
    const { finalizeCommunityMessengerCallTerminalExit } = await import(
      "@/lib/community-messenger/call-session-navigation-seed"
    );
    const router = { replace: vi.fn() };
    finalizeCommunityMessengerCallTerminalExit(router, "call-finalize", "test_finalize");
    expect(isOutgoingCallStartBlocked()).toBe(false);
    expect(getActiveCallSessionCallId()).toBeNull();
  });
});
