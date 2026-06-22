import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getActiveCallSessionCallId,
  hardClearActiveCallSession,
  resetActiveCallSessionForTests,
  setActiveCallSession,
} from "@/lib/call/active-call-session";
import {
  acquireCallActionLock,
  bindCallActionLockCallId,
  isOutgoingCallStartBlocked,
  releaseCallActionLock,
  resetCallActionLockForTests,
} from "@/lib/call/call-action-lock";
import {
  callEngineAcceptIncoming,
  runCallEnginePatchAction,
} from "@/lib/community-messenger/call-engine/call-engine-actions";
import {
  claimCallEngineSurfaceOwner,
  resolveCallEngineIncomingSurfaceOwner,
} from "@/lib/community-messenger/call-engine/call-engine-surface-owner";
import {
  clearCallEngineLocks,
  getCallEngineSurfaceOwner,
  isCallEngineTerminalConsumed,
  resetCallEngineLocksForTests,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import { resetCallEngineStateForTests, setCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import { finalizeCommunityMessengerCallTerminalExit } from "@/lib/community-messenger/call-session-navigation-seed";
import { releaseCallEngineTerminalLocalState } from "@/lib/community-messenger/call-engine/call-engine-terminal-cleanup";
import { markCallConsumed, resetDibayCallSessionState } from "@/lib/community-messenger/incoming-call-state";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const patchCommunityMessengerCallSession = vi.fn();

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  patchCommunityMessengerCallSession: (...args: unknown[]) => patchCommunityMessengerCallSession(...args),
}));

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

vi.mock("@/lib/community-messenger/call-lifecycle", () => ({
  dibayIncomingLaneStopRing: vi.fn(),
}));

vi.mock("@/lib/push/native/dismiss-native-incoming-call-notification", () => ({
  dismissAllIncomingCallNotificationsFireAndForget: vi.fn(),
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

describe("call-engine device audit contract", () => {
  beforeEach(() => {
    patchCommunityMessengerCallSession.mockReset();
    patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "x" } });
    resetActiveCallSessionForTests();
    resetCallActionLockForTests();
    resetCallEngineLocksForTests();
    resetCallEngineStateForTests();
    resetDibayCallSessionState();
  });

  describe("terminal cleanup releases all locks", () => {
    it.each(["cancel", "end", "reject", "missed"] as const)(
      "releases action lock on %s",
      async (action) => {
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
      await runCallEnginePatchAction({ callId: "c-term", action, source: "audit" });
      await releaseCallEngineTerminalLocalState("c-term", action);
      expect(isOutgoingCallStartBlocked()).toBe(false);
    });

    it("finalize terminal exit releases action lock and active session", () => {
      acquireCallActionLock({ roomId: "room-b", mediaType: "voice" });
      bindCallActionLockCallId("c-fin");
      setActiveCallSession({
        callId: "c-fin",
        roomId: "room-b",
        peerUserId: null,
        role: "caller",
        mediaType: "voice",
        phase: "ringing",
      });
      finalizeCommunityMessengerCallTerminalExit({ replace: vi.fn() }, "c-fin", "audit");
      expect(isOutgoingCallStartBlocked()).toBe(false);
      expect(getActiveCallSessionCallId()).toBeNull();
    });

    it("hard clear after terminal PATCH allows new callId", async () => {
      await runCallEnginePatchAction({ callId: "old", action: "end", source: "audit" });
      await hardClearActiveCallSession("old", "ended");
      acquireCallActionLock({ roomId: "room-new", mediaType: "voice" });
      expect(isOutgoingCallStartBlocked()).toBe(true);
      releaseCallActionLock("audit");
      const next = acquireCallActionLock({ roomId: "room-new", mediaType: "voice" });
      expect(next.ok).toBe(true);
    });
  });

  describe("redial after terminal", () => {
    it("ended does not block new callId accept", async () => {
      await runCallEnginePatchAction({ callId: "c1", action: "end", source: "audit" });
      patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "c2" } });
      const next = await callEngineAcceptIncoming({ callId: "c2", source: "audit" });
      expect(next.ok).toBe(true);
    });

    it("sequential same-room bootstrap lock releases between calls", async () => {
      const first = acquireCallActionLock({ roomId: "room-same", mediaType: "voice" });
      expect(first.ok).toBe(true);
      bindCallActionLockCallId("same-1");
      releaseCallActionLock("terminal");
      const second = acquireCallActionLock({ roomId: "room-same", mediaType: "voice" });
      expect(second.ok).toBe(true);
    });

    it("sequential different-room allowed after terminal", async () => {
      acquireCallActionLock({ roomId: "room-a", mediaType: "voice" });
      releaseCallActionLock("terminal");
      const other = acquireCallActionLock({ roomId: "room-b", mediaType: "video" });
      expect(other.ok).toBe(true);
    });
  });

  describe("surface exclusive", () => {
    it("same callId surface owner is exclusive", () => {
      setCallEngineState("surf-1", "incoming_ringing");
      expect(claimCallEngineSurfaceOwner("surf-1", "web_in_app_banner")).toBe(true);
      expect(claimCallEngineSurfaceOwner("surf-1", "native_fullscreen_intent")).toBe(false);
      expect(getCallEngineSurfaceOwner("surf-1")).toBe("web_in_app_banner");
    });

    it("call screen owner suppresses banner claim", () => {
      setCallEngineState("surf-2", "incoming_ringing");
      expect(claimCallEngineSurfaceOwner("surf-2", "web_call_screen")).toBe(true);
      expect(claimCallEngineSurfaceOwner("surf-2", "web_in_app_banner")).toBe(false);
    });

    it("native fsi suppresses web banner only in background", () => {
      setCallEngineState("surf-3", "incoming_ringing");
      const owner = resolveCallEngineIncomingSurfaceOwner({
        callId: "surf-3",
        appVisibility: "background",
        hasNativeFsi: true,
        requestOwner: "web_in_app_banner",
      });
      expect(owner).toBeNull();
    });

    it("terminal consumed blocks surface resolve", () => {
      markCallConsumed("surf-dead", "ended");
      const owner = resolveCallEngineIncomingSurfaceOwner({
        callId: "surf-dead",
        appVisibility: "foreground",
        hasNativeFsi: false,
        requestOwner: "web_in_app_banner",
      });
      expect(owner).toBeNull();
    });
  });

  describe("stale ringing after accept", () => {
    it("optimistic accepted consumed allows accept PATCH once then blocks duplicate", async () => {
      markCallConsumed("acc-1", "accepted");
      patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "acc-1" } });
      const accept = await callEngineAcceptIncoming({ callId: "acc-1", source: "audit" });
      expect(accept.ok).toBe(true);
      expect(isCallEngineTerminalConsumed("acc-1")).toBe(false);
      const duplicate = await callEngineAcceptIncoming({ callId: "acc-1", source: "audit" });
      expect(duplicate.ok).toBe(false);
      expect(duplicate.error).toBe("duplicate_action");
    });

    it("CallClient has stale ringing defense for accepted consumed", () => {
      const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
      expect(client).toContain("readCallConsumedReason(sessionId) === \"accepted\"");
      expect(client).toContain("stale_ringing_blocked");
    });
  });

  describe("outgoing cancel releases action lock", () => {
    it("cancel PATCH clears engine locks for callId", async () => {
      setCallEngineState("c-cancel", "incoming_ringing");
      claimCallEngineSurfaceOwner("c-cancel", "web_call_screen");
      acquireCallActionLock({ roomId: "r1", mediaType: "voice" });
      bindCallActionLockCallId("c-cancel");
      await runCallEnginePatchAction({ callId: "c-cancel", action: "cancel", source: "audit" });
      await hardClearActiveCallSession("c-cancel", "cancelled");
      expect(isOutgoingCallStartBlocked()).toBe(false);
      expect(isCallEngineTerminalConsumed("c-cancel")).toBe(true);
      clearCallEngineLocks("c-cancel");
      expect(getCallEngineSurfaceOwner("c-cancel")).toBeNull();
    });
  });

  describe("structural wiring contracts", () => {
    it("Global dispatches incoming_discovered to controller", () => {
      const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
      expect(global).toContain('type: "incoming_discovered"');
    });

    it("launchOutgoingDirectCall dispatches outgoing_create via CallEngine", () => {
      const seed = read("lib/community-messenger/call-session-navigation-seed.ts");
      expect(seed).toContain("dispatchOutgoingCallEngineSignal");
      expect(seed).toContain('type: "outgoing_create"');
      expect(seed).toContain('type: "outgoing_ringback_start"');
    });

    it("audit log helpers exist for device QA", () => {
      const audit = read("lib/community-messenger/call-engine/call-engine-audit-log.ts");
      expect(audit).toContain("[DIBAY_CALL_ENGINE]");
      expect(audit).toContain("call_button_state");
      expect(audit).toContain("surface_decision");
      expect(audit).toContain("sound_state");
      expect(audit).toContain("[DIBAY_CALL_METRIC]");
    });
  });
});
