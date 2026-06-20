import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveCallSessionCallId,
  resetActiveCallSessionForTests,
  setActiveCallSession,
} from "@/lib/call/active-call-session";
import {
  acquireCallActionLock,
  bindCallActionLockCallId,
  isOutgoingCallStartBlocked,
  resetCallActionLockForTests,
} from "@/lib/call/call-action-lock";
import { guardInstantOutgoingCallStart } from "@/lib/call/outgoing-call-start-guard";
import { cleanupCommunityCallTerminal } from "@/lib/community-messenger/call-terminal-cleanup";
import {
  readDockedCallSessionId,
  readHostedActiveCallSessionId,
  readPipMinimizedCallSessionId,
  writeDockedCallSession,
  writeHostedActiveCallSession,
  writePipMinimizedCallSession,
} from "@/lib/community-messenger/call-presentation-ownership";
import {
  getCommunityMessengerCallRuntimeSurface,
  resetCommunityMessengerCallRuntimeSurface,
  syncCommunityMessengerCallRuntimeSurface,
} from "@/lib/community-messenger/call-runtime-registry";

vi.mock("@/lib/call/native/native-call-service", () => ({
  endNativeCallService: vi.fn(async () => true),
  reportNativeCallRemoteEnded: vi.fn(async () => true),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => ({ id: "user-1", phone_verified: true }),
}));

vi.mock("@/lib/auth/phone-verification-required-client", () => ({
  openPhoneVerificationRequiredSheet: vi.fn(),
}));

vi.mock("@/lib/auth/assert-phone-verified-for-messenger-action-client", () => ({
  assertPhoneVerifiedForMessengerActionOrOpenSheet: () => true,
  resolveMessengerActionReturnPath: () => "/community-messenger",
}));

function createSessionStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("cleanupCommunityCallTerminal", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createSessionStorageStub());
    resetActiveCallSessionForTests();
    resetCallActionLockForTests();
    resetCommunityMessengerCallRuntimeSurface();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears active session after local end", async () => {
    setActiveCallSession({
      callId: "call-local-end",
      roomId: "room-1",
      peerUserId: "peer-1",
      role: "caller",
      mediaType: "voice",
      phase: "active",
      connected: true,
      machinePhase: "CONNECTED",
    });

    await cleanupCommunityCallTerminal({
      sessionId: "call-local-end",
      reason: "ended",
      source: "test_local_end",
    });

    expect(getActiveCallSessionCallId()).toBeNull();
  });

  it("releases call-action-lock after reject", async () => {
    acquireCallActionLock({ roomId: "room-1", mediaType: "voice" });
    bindCallActionLockCallId("call-reject");
    expect(isOutgoingCallStartBlocked()).toBe(true);

    await cleanupCommunityCallTerminal({
      sessionId: "call-reject",
      reason: "rejected",
      source: "test_reject",
    });

    expect(isOutgoingCallStartBlocked()).toBe(false);
  });

  it("allows immediate outgoing start after cancel cleanup", async () => {
    setActiveCallSession({
      callId: "call-cancel",
      roomId: "room-2",
      peerUserId: "peer-2",
      role: "caller",
      mediaType: "voice",
      phase: "ringing",
    });
    acquireCallActionLock({ roomId: "room-2", mediaType: "voice" });
    bindCallActionLockCallId("call-cancel");

    await cleanupCommunityCallTerminal({
      sessionId: "call-cancel",
      reason: "cancelled",
      source: "test_cancel",
    });

    const guard = guardInstantOutgoingCallStart({ roomId: "room-next", kind: "voice" });
    expect(guard.ok).toBe(true);
  });

  it("clears hosted/dock/pip/runtime on remote terminal", async () => {
    writeHostedActiveCallSession("call-remote");
    writeDockedCallSession("call-remote");
    writePipMinimizedCallSession("call-remote");
    syncCommunityMessengerCallRuntimeSurface({
      presentation: "minimized",
    });

    await cleanupCommunityCallTerminal({
      sessionId: "call-remote",
      reason: "remote_ended",
      source: "test_remote_terminal",
    });

    expect(readHostedActiveCallSessionId()).toBeNull();
    expect(readDockedCallSessionId()).toBeNull();
    expect(readPipMinimizedCallSessionId()).toBeNull();
    expect(getCommunityMessengerCallRuntimeSurface().presentation).toBe("idle");
  });

  it("is idempotent when called twice", async () => {
    setActiveCallSession({
      callId: "call-idempotent",
      roomId: "room-9",
      peerUserId: "peer-9",
      role: "caller",
      mediaType: "voice",
      phase: "active",
      connected: true,
      machinePhase: "CONNECTED",
    });
    acquireCallActionLock({ roomId: "room-9", mediaType: "voice" });
    bindCallActionLockCallId("call-idempotent");

    await cleanupCommunityCallTerminal({
      sessionId: "call-idempotent",
      reason: "ended",
      source: "test_idempotent_first",
    });
    await cleanupCommunityCallTerminal({
      sessionId: "call-idempotent",
      reason: "ended",
      source: "test_idempotent_second",
    });

    expect(getActiveCallSessionCallId()).toBeNull();
    expect(isOutgoingCallStartBlocked()).toBe(false);
  });
});
