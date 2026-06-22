import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireCallActionLock,
  bindCallActionLockCallId,
  isOutgoingCallStartBlocked,
  releaseCallActionLock,
  resetCallActionLockForTests,
} from "@/lib/call/call-action-lock";
import {
  getActiveCallSessionCallId,
  hardClearActiveCallSession,
  resetActiveCallSessionForTests,
  setActiveCallSession,
} from "@/lib/call/active-call-session";
import {
  applyNativeIncomingSurfaceSignal,
  resetNativeIncomingSurfaceForTests,
} from "@/lib/community-messenger/call-engine/call-engine-native-surface";
import {
  shouldIgnoreIncomingDiscovered,
} from "@/lib/community-messenger/call-engine/call-engine-incoming-discovered-guard";
import { releaseCallEngineTerminalLocalState } from "@/lib/community-messenger/call-engine/call-engine-terminal-cleanup";
import {
  claimCallEngineSurfaceOwner,
  resolveCallEngineIncomingSurfaceOwner,
} from "@/lib/community-messenger/call-engine/call-engine-surface-owner";
import {
  markCallEngineTerminalConsumed,
  resetCallEngineLocksForTests,
  tryLockCallEngineSurfaceOwner,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import {
  replaceCallEngineRouteOnce,
  routeCallEngineForAccept,
} from "@/lib/community-messenger/call-engine/call-engine-route-gate";
import { resetCallEngineStateForTests, setCallEngineState, syncCallEngineStateFromSession } from "@/lib/community-messenger/call-engine/call-engine-state";
import {
  dispatchCallEngineSignal,
  resetCallEngineControllerForTests,
} from "@/lib/community-messenger/call-engine/call-engine-controller";
import {
  markCallConsumed,
  resetDibayCallSessionState,
} from "@/lib/community-messenger/incoming-call-state";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const seedNavMocks = vi.hoisted(() => ({
  rememberCallNavigationReturnPathMock: vi.fn(),
  primeCommunityMessengerCallNavigationSeedMock: vi.fn(),
  clearCallNavigationSeedForCallIdMock: vi.fn(),
  clearLastConsumedNavigationSeedMock: vi.fn(),
}));

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

vi.mock("@/lib/community-messenger/call-outgoing-ringback-controller", () => ({
  startOutgoingRingback: vi.fn(),
  stopOutgoingRingback: vi.fn(),
  stopAllOutgoingRingback: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  unlockCommunityMessengerCallPlaybackFromUserGesture: vi.fn(),
  startCommunityMessengerCallTone: vi.fn(),
  stopCommunityMessengerCallTone: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-media-permission-preflight", () => ({
  ensureCallMediaForUserGesture: vi.fn(async () => true),
}));

vi.mock("@/lib/community-messenger/call-connection-prefetch", () => ({
  primeCommunityMessengerCallConnectionPrefetch: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-session-navigation-seed", () => ({
  rememberCallNavigationReturnPath: seedNavMocks.rememberCallNavigationReturnPathMock,
  primeCommunityMessengerCallNavigationSeed: seedNavMocks.primeCommunityMessengerCallNavigationSeedMock,
  clearCallNavigationSeedForCallId: seedNavMocks.clearCallNavigationSeedForCallIdMock,
  clearLastConsumedNavigationSeed: seedNavMocks.clearLastConsumedNavigationSeedMock,
}));

vi.mock("@/lib/community-messenger/native-callee-accept-entry", () => ({
  markNativeCalleeAcceptPending: vi.fn(),
}));

vi.mock("@/lib/push/native/dismiss-native-incoming-call-notification", () => ({
  dismissAllIncomingCallNotificationsFireAndForget: vi.fn(),
}));

vi.mock("@/lib/community-messenger/multi-tab-bus", () => ({
  postCommunityMessengerCallIncomingConsumedBusEvent: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-lifecycle", () => ({
  dibayIncomingLaneStopRing: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-engine/call-engine-ringtone-owner", () => ({
  startCallEngineIncomingRingtone: vi.fn(),
  stopCallEngineIncomingRingtone: vi.fn(),
  startCallEngineOutgoingRingback: vi.fn(),
  stopCallEngineOutgoingRingback: vi.fn(),
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

describe("call-engine P0 guards", () => {
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

  describe("P0-1 native surface blocks web banner only outside foreground", () => {
    it("foreground native surface does not block web banner resolve", () => {
      applyNativeIncomingSurfaceSignal({
        callId: "c-native",
        hasNativeIncomingSurface: true,
        nativeSurfaceType: "foreground_pill",
        appVisibility: "foreground",
        source: "native_foreground_pill",
      });
      const owner = resolveCallEngineIncomingSurfaceOwner({
        callId: "c-native",
        appVisibility: "foreground",
        hasNativeFsi: true,
        requestOwner: "web_in_app_banner",
      });
      expect(owner).toBe("web_in_app_banner");
    });

    it("background native surface blocks web banner resolve", () => {
      applyNativeIncomingSurfaceSignal({
        callId: "c-native-2",
        hasNativeIncomingSurface: true,
        nativeSurfaceType: "fullscreen_intent",
        appVisibility: "background",
        source: "native_fsi",
      });
      const owner = resolveCallEngineIncomingSurfaceOwner({
        callId: "c-native-2",
        appVisibility: "background",
        hasNativeFsi: true,
        requestOwner: "web_in_app_banner",
      });
      expect(owner).toBeNull();
    });
  });

  describe("P0-2 accepted consumed blocks stale ringing", () => {
    it("accepted consumed blocks stale ringing discovery", () => {
      markCallConsumed("c-acc", "accepted");
      const guard = shouldIgnoreIncomingDiscovered({
        callId: "c-acc",
        sessionStatus: "ringing",
        requestWebBanner: true,
      });
      expect(guard.ignore).toBe(true);
      expect(guard.reason).toBe("accepted_consumed_blocks_stale_ringing");
    });

    it.each([
      ["accepting", () => setCallEngineState("c-phase", "accepting")],
      ["joining", () => {
        syncCallEngineStateFromSession("c-phase", "ringing", false);
        setCallEngineState("c-phase", "accepting");
        setCallEngineState("c-phase", "joining");
      }],
      ["connected", () => syncCallEngineStateFromSession("c-phase", "active", false)],
    ] as const)("phase %s blocks ringing regression", (_phase, setup) => {
      setup();
        const guard = shouldIgnoreIncomingDiscovered({
          callId: "c-phase",
          sessionStatus: "ringing",
          requestWebBanner: true,
        });
        expect(guard.ignore).toBe(true);
        expect(guard.reason).toBe("stale_ringing_after_accept");
      }
    );

    it("web call screen owner blocks incoming banner", () => {
      tryLockCallEngineSurfaceOwner("c-screen", "web_call_screen");
      const guard = shouldIgnoreIncomingDiscovered({
        callId: "c-screen",
        sessionStatus: "ringing",
        requestWebBanner: true,
      });
      expect(guard.ignore).toBe(true);
      expect(guard.reason).toBe("web_call_screen_owner_blocks_incoming");
    });

    it("incoming_discovered controller returns error for accepted consumed", async () => {
      markCallConsumed("c-stale", "accepted");
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const res = await dispatchCallEngineSignal({
        type: "incoming_discovered",
        session: ringingSession("c-stale"),
        appVisibility: "foreground",
        hardClearedAt: new Map(),
        source: "test",
      });
      expect(res.ok).toBe(false);
      expect(res.error).toBe("accepted_consumed_blocks_stale_ringing");
      expect(infoSpy).toHaveBeenCalledWith(
        "[DIBAY_CALL_ENGINE]",
        "incoming_discovered_ignored",
        expect.objectContaining({ callId: "c-stale", reason: "accepted_consumed_blocks_stale_ringing" })
      );
      infoSpy.mockRestore();
    });
  });

  describe("P0-3 terminal cleanup releases lock and enables redial", () => {
    it("releaseCallEngineTerminalLocalState releases call-action-lock", async () => {
      acquireCallActionLock({ roomId: "room-a", mediaType: "voice" });
      bindCallActionLockCallId("c-term");
      setActiveCallSession({
        callId: "c-term",
        roomId: "room-a",
        peerUserId: "peer",
        role: "caller",
        mediaType: "voice",
        phase: "active",
      });
      await releaseCallEngineTerminalLocalState("c-term", "ended");
      expect(isOutgoingCallStartBlocked()).toBe(false);
      expect(getActiveCallSessionCallId()).toBeNull();
      expect(seedNavMocks.clearCallNavigationSeedForCallIdMock).toHaveBeenCalledWith("c-term");
      expect(seedNavMocks.clearLastConsumedNavigationSeedMock).toHaveBeenCalledWith("c-term");
    });

    it("same room sequential call allowed after terminal cleanup", async () => {
      acquireCallActionLock({ roomId: "room-same", mediaType: "voice" });
      bindCallActionLockCallId("same-1");
      await releaseCallEngineTerminalLocalState("same-1", "ended");
      const next = acquireCallActionLock({ roomId: "room-same", mediaType: "voice" });
      expect(next.ok).toBe(true);
    });

    it("different room sequential call allowed after terminal cleanup", async () => {
      acquireCallActionLock({ roomId: "room-a", mediaType: "voice" });
      bindCallActionLockCallId("diff-1");
      await releaseCallEngineTerminalLocalState("diff-1", "ended");
      const other = acquireCallActionLock({ roomId: "room-b", mediaType: "video" });
      expect(other.ok).toBe(true);
    });

    it("new callId not blocked by previous callId lock residue", async () => {
      acquireCallActionLock({ roomId: "room-old", mediaType: "voice" });
      bindCallActionLockCallId("old-call");
      await hardClearActiveCallSession("old-call", "ended");
      releaseCallActionLock("manual");
      const redial = acquireCallActionLock({ roomId: "room-old", mediaType: "voice" });
      expect(redial.ok).toBe(true);
      bindCallActionLockCallId("new-call");
      expect(isOutgoingCallStartBlocked()).toBe(true);
      await releaseCallEngineTerminalLocalState("new-call", "ended");
      const after = acquireCallActionLock({ peerUserId: "peer-2", mediaType: "voice" });
      expect(after.ok).toBe(true);
    });
  });

  describe("surface owner resolve web_call_screen", () => {
    it("web_call_screen owner blocks web_in_app_banner resolve", () => {
      claimCallEngineSurfaceOwner("c-owner", "web_call_screen");
      const owner = resolveCallEngineIncomingSurfaceOwner({
        callId: "c-owner",
        appVisibility: "foreground",
        hasNativeFsi: false,
        requestOwner: "web_in_app_banner",
      });
      expect(owner).toBeNull();
    });
  });

  describe("P0-4 accepted vs terminal consumed", () => {
    it("accepted consumed allows route", () => {
      markCallConsumed("c-acc-route", "accepted");
      const router = { replace: vi.fn() };
      const href = "/community-messenger/calls/c-acc-route?mode=active";
      expect(routeCallEngineForAccept(router, "c-acc-route", href)).toBe(true);
      expect(router.replace).toHaveBeenCalledWith(href);
    });

    it("terminal consumed blocks replaceCallEngineRouteOnce but routeCallEngineForAccept still navigates", () => {
      markCallEngineTerminalConsumed("c-term-route");
      const router = { replace: vi.fn() };
      const href = "/community-messenger/calls/c-term-route?mode=active";
      expect(replaceCallEngineRouteOnce(router, "c-term-route", href)).toBe(false);
      expect(routeCallEngineForAccept(router, "c-term-route", href)).toBe(false);
      expect(router.replace).toHaveBeenCalledWith(href);
    });
  });

  describe("P0-3 activeCallSession dual id clear", () => {
    it("clears active session when alternate sessionId matches", async () => {
      setActiveCallSession({
        callId: "session-abc",
        roomId: "room-1",
        peerUserId: "peer",
        role: "caller",
        mediaType: "voice",
        phase: "ringing",
      });
      await hardClearActiveCallSession("call-alias", "ended", { alternateId: "session-abc" });
      expect(getActiveCallSessionCallId()).toBeNull();
    });

    it("terminal active session does not block new outgoing after cleanup", async () => {
      setActiveCallSession({
        callId: "old-live",
        roomId: "room-z",
        peerUserId: "peer",
        role: "caller",
        mediaType: "voice",
        phase: "active",
      });
      markCallEngineTerminalConsumed("old-live");
      await releaseCallEngineTerminalLocalState("old-live", "ended");
      expect(isOutgoingCallStartBlocked()).toBe(false);
      const next = acquireCallActionLock({ roomId: "room-z", mediaType: "voice" });
      expect(next.ok).toBe(true);
    });
  });
});
