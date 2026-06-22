import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireCallActionLock,
  bindCallActionLockCallId,
  isOutgoingCallStartBlocked,
  releaseCallActionLock,
  resetCallActionLockForTests,
} from "@/lib/call/call-action-lock";
import {
  hardClearActiveCallSession,
  resetActiveCallSessionForTests,
  setActiveCallSession,
} from "@/lib/call/active-call-session";
import {
  applyNativeIncomingSurfaceSignal,
  resetNativeIncomingSurfaceForTests,
  shouldNativeSurfaceBlockWebBanner,
} from "@/lib/community-messenger/call-engine/call-engine-native-surface";
import { shouldIgnoreIncomingDiscovered } from "@/lib/community-messenger/call-engine/call-engine-incoming-discovered-guard";
import {
  resolveCallEngineIncomingSurfaceOwner,
} from "@/lib/community-messenger/call-engine/call-engine-surface-owner";
import { resetCallEngineLocksForTests } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { resetCallEngineStateForTests } from "@/lib/community-messenger/call-engine/call-engine-state";
import {
  dispatchCallEngineSignal,
  resetCallEngineControllerForTests,
} from "@/lib/community-messenger/call-engine/call-engine-controller";
import { handleCallEngineRemoteTerminal } from "@/lib/community-messenger/call-engine/call-engine-remote-terminal";
import { resetDibayCallSessionState } from "@/lib/community-messenger/incoming-call-state";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

vi.mock("@/lib/community-messenger/call-orchestrator", () => ({
  logDibayCall: vi.fn(),
  sealDibayCallTerminalSurface: vi.fn(),
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  endNativeCallService: vi.fn(async () => true),
  reportNativeCallRemoteEnded: vi.fn(async () => true),
}));

vi.mock("@/lib/call/native/call-heartbeat-watchdog", () => ({
  stopCallHeartbeatWatchdog: vi.fn(),
}));

vi.mock("@/lib/community-messenger/incoming-call/ring-owner", () => ({
  syncIncomingCallRing: vi.fn(),
  stopIncomingCallRing: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-lifecycle", () => ({
  dibayIncomingLaneStopRing: vi.fn(),
}));

vi.mock("@/lib/push/native/dismiss-native-incoming-call-notification", () => ({
  dismissAllIncomingCallNotificationsFireAndForget: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-engine/call-engine-ringtone-owner", () => ({
  startCallEngineIncomingRingtone: vi.fn(),
  stopCallEngineIncomingRingtone: vi.fn(),
  startCallEngineOutgoingRingback: vi.fn(),
  stopCallEngineOutgoingRingback: vi.fn(),
}));

vi.mock("@/lib/push/native/push-route-native-bridge", () => ({
  getSyncNativeIncomingCallPlugin: vi.fn(() => null),
  getNativeIncomingCallPlugin: vi.fn(async () => null),
}));

function ringingSession(id: string): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "caller",
    recipientUserId: "self",
    peerUserId: "caller",
    peerLabel: "Caller",
    callKind: "voice",
    status: "ringing",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
  };
}

describe("call-engine P0 visibility policy", () => {
  beforeEach(() => {
    resetCallActionLockForTests();
    resetActiveCallSessionForTests();
    resetCallEngineLocksForTests();
    resetCallEngineStateForTests();
    resetDibayCallSessionState();
    resetNativeIncomingSurfaceForTests();
    resetCallEngineControllerForTests();
    vi.clearAllMocks();
  });

  it("foreground allows web banner even if native surface signal exists", () => {
    applyNativeIncomingSurfaceSignal({
      callId: "c-fg",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "foreground_pill",
      appVisibility: "foreground",
      source: "native_foreground_pill",
    });
    expect(shouldNativeSurfaceBlockWebBanner("c-fg", "foreground")).toBe(false);
    const owner = resolveCallEngineIncomingSurfaceOwner({
      callId: "c-fg",
      appVisibility: "foreground",
      hasNativeFsi: true,
      requestOwner: "web_in_app_banner",
    });
    expect(owner).toBe("web_in_app_banner");
    const guard = shouldIgnoreIncomingDiscovered({
      callId: "c-fg",
      sessionStatus: "ringing",
      requestWebBanner: true,
      appVisibility: "foreground",
    });
    expect(guard.ignore).toBe(false);
  });

  it("background blocks web banner when native notification exists", () => {
    applyNativeIncomingSurfaceSignal({
      callId: "c-bg",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "heads_up",
      appVisibility: "background",
      source: "native_notification",
    });
    expect(shouldNativeSurfaceBlockWebBanner("c-bg", "background")).toBe(true);
    const owner = resolveCallEngineIncomingSurfaceOwner({
      callId: "c-bg",
      appVisibility: "background",
      hasNativeFsi: true,
      requestOwner: "web_in_app_banner",
    });
    expect(owner).toBeNull();
  });

  it("locked blocks web banner when FSI exists", () => {
    applyNativeIncomingSurfaceSignal({
      callId: "c-lock",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "fullscreen_intent",
      appVisibility: "locked",
      source: "native_fsi",
    });
    const owner = resolveCallEngineIncomingSurfaceOwner({
      callId: "c-lock",
      appVisibility: "locked",
      hasNativeFsi: true,
      requestOwner: "web_in_app_banner",
    });
    expect(owner).toBeNull();
  });

  it("remote cancelled stops receiver ringtone path via controller", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await dispatchCallEngineSignal({
      type: "remote_terminal",
      callId: "c-remote",
      status: "cancelled",
      source: "realtime",
    });
    expect(res.ok).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith(
      "[DIBAY_CALL_ENGINE]",
      "remote_terminal_received",
      expect.objectContaining({ callId: "c-remote", status: "cancelled" }),
    );
    infoSpy.mockRestore();
  });

  it("terminal cleanup enables redial after cancel", async () => {
    acquireCallActionLock({ roomId: "room-a", mediaType: "voice" });
    bindCallActionLockCallId("c-cancel");
    setActiveCallSession({
      callId: "c-cancel",
      roomId: "room-a",
      peerUserId: "peer",
      role: "caller",
      mediaType: "voice",
      phase: "ringing",
    });
    await handleCallEngineRemoteTerminal({ callId: "c-cancel", status: "cancelled", source: "poll" });
    expect(isOutgoingCallStartBlocked()).toBe(false);
  });

  it("previous terminal callId does not block new outgoing call", async () => {
    acquireCallActionLock({ roomId: "room-old", mediaType: "voice" });
    bindCallActionLockCallId("old-call");
    await handleCallEngineRemoteTerminal({ callId: "old-call", status: "ended", source: "poll" });
    const next = acquireCallActionLock({ roomId: "room-new", mediaType: "voice" });
    expect(next.ok).toBe(true);
    releaseCallActionLock("test");
  });

  it("hydrate terminal session dispatches remote cleanup", async () => {
    const cancelled: CommunityMessengerCallSession = {
      ...ringingSession("c-hydrate"),
      status: "cancelled",
      endedAt: new Date().toISOString(),
    };
    const res = await dispatchCallEngineSignal({
      type: "hydrate_session",
      session: cancelled,
      source: "poll_hydrate",
    });
    expect(res.ok).toBe(true);
  });
});
