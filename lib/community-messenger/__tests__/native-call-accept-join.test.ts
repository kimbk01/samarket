import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canStartCalleeJoin,
  clearServerActiveConfirmed,
  isOptimisticActiveCallSessionSeed,
  markServerActiveConfirmed,
  shouldAutoEndAfterJoinFailure,
  waitForActiveCallSessionAfterNativeAccept,
} from "@/lib/community-messenger/native-call-accept-join";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function session(
  status: CommunityMessengerCallSession["status"],
  source?: string
): CommunityMessengerCallSession {
  return {
    id: "sess-1",
    status,
    callKind: "video",
    sessionMode: "direct",
    isMineInitiator: false,
    roomId: "room-1",
    initiatorUserId: "u1",
    recipientUserId: "u2",
    peerUserId: "u1",
    peerLabel: "Peer",
    participants: [],
    startedAt: null,
    answeredAt: null,
    endedAt: null,
    source,
  } as unknown as CommunityMessengerCallSession;
}

describe("native-call-accept-join helpers", () => {
  afterEach(() => {
    clearServerActiveConfirmed("sess-1");
  });

  it("detects optimistic active seeds", () => {
    expect(isOptimisticActiveCallSessionSeed(session("active", "native_accept_bootstrap"))).toBe(true);
    expect(isOptimisticActiveCallSessionSeed(session("active", "native_accept_prep_bootstrap"))).toBe(true);
    expect(isOptimisticActiveCallSessionSeed(session("active", "native_accept_hydrate_seed"))).toBe(true);
    expect(isOptimisticActiveCallSessionSeed(session("active", "server_refresh"))).toBe(false);
    expect(isOptimisticActiveCallSessionSeed(session("ringing", "native_accept_bootstrap"))).toBe(false);
  });

  it("defers callee join until server active is confirmed", () => {
    const optimistic = session("active", "native_accept_bootstrap");
    expect(canStartCalleeJoin({ session: optimistic, isCallee: true })).toEqual({
      ok: false,
      reason: "deferred",
    });
    markServerActiveConfirmed("sess-1");
    expect(canStartCalleeJoin({ session: optimistic, isCallee: true })).toEqual({ ok: true });
  });

  it("does not auto-end during accept race window", () => {
    expect(
      shouldAutoEndAfterJoinFailure({
        sessionId: "sess-1",
        nativePrepRoute: true,
        nativeAcceptCompletedRoute: false,
        acceptPatchInFlight: false,
        busyAccept: false,
        joinRetryCount: 0,
        serverStatusAfterRefresh: "active",
        joinRetryable: true,
      })
    ).toBe(false);
    expect(
      shouldAutoEndAfterJoinFailure({
        sessionId: "sess-1",
        nativePrepRoute: false,
        nativeAcceptCompletedRoute: false,
        acceptPatchInFlight: false,
        busyAccept: false,
        joinRetryCount: 0,
        serverStatusAfterRefresh: "ringing",
        joinRetryable: true,
      })
    ).toBe(false);
    expect(
      shouldAutoEndAfterJoinFailure({
        sessionId: "sess-1",
        nativePrepRoute: false,
        nativeAcceptCompletedRoute: false,
        acceptPatchInFlight: false,
        busyAccept: false,
        joinRetryCount: 2,
        serverStatusAfterRefresh: "ended",
        joinRetryable: false,
      })
    ).toBe(true);
  });
});

describe("waitForActiveCallSessionAfterNativeAccept", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns active session after refresh catches up", async () => {
    let current: CommunityMessengerCallSession | null = session("ringing");
    const refreshSession = vi.fn(async () => {
      current = session("active");
      return current;
    });
    const promise = waitForActiveCallSessionAfterNativeAccept({
      refreshSession,
      readSession: () => current,
      maxAttempts: 3,
      delayMs: 100,
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result?.status).toBe("active");
    expect(refreshSession).toHaveBeenCalled();
  });

  it("returns null when session never becomes active", async () => {
    const current = session("ringing");
    const refreshSession = vi.fn(async () => current);
    const promise = waitForActiveCallSessionAfterNativeAccept({
      refreshSession,
      readSession: () => current,
      maxAttempts: 2,
      delayMs: 50,
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeNull();
  });
});
