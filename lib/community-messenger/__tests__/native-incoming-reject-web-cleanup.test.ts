import { describe, expect, it, beforeEach } from "vitest";
import { resetActiveCallSessionForTests } from "@/lib/call/active-call-session";
import { isOutgoingCallStartBlocked, resetCallActionLockForTests } from "@/lib/call/call-action-lock";
import { resetIncomingCallSurfaceOwner } from "@/lib/community-messenger/incoming-call-surface-owner";
import { isDibayCallConsumed, resetDibayCallSessionState } from "@/lib/community-messenger/incoming-call-state";
import { applyNativeIncomingRejectWebCleanup } from "@/lib/community-messenger/incoming-call/native-incoming-reject-web-cleanup";

describe("native-incoming-reject-web-cleanup", () => {
  beforeEach(() => {
    resetDibayCallSessionState();
    resetIncomingCallSurfaceOwner();
    resetCallActionLockForTests();
    resetActiveCallSessionForTests();
  });

  it("marks consumed, clears lock, and removes session on native reject", () => {
    const hardClearedAt = new Map<string, number>();
    const activeIncomingCallIds = new Set<string>(["call-reject-1"]);
    const removed: string[] = [];

    applyNativeIncomingRejectWebCleanup({
      sessionId: "call-reject-1",
      source: "native_reject",
      hardClearedAt,
      activeIncomingCallIds,
      suppressMissedSound: new Set(),
      removeSessionFromIncomingList: (id) => removed.push(id),
    });

    expect(isDibayCallConsumed("call-reject-1")).toBe(true);
    expect(activeIncomingCallIds.has("call-reject-1")).toBe(false);
    expect(hardClearedAt.has("call-reject-1")).toBe(true);
    expect(removed).toEqual(["call-reject-1"]);
    expect(isOutgoingCallStartBlocked()).toBe(false);
  });

  it("is idempotent when already consumed", () => {
    applyNativeIncomingRejectWebCleanup({
      sessionId: "call-reject-2",
      source: "native_reject",
      hardClearedAt: new Map(),
      activeIncomingCallIds: new Set(),
      suppressMissedSound: new Set(),
    });
    expect(() =>
      applyNativeIncomingRejectWebCleanup({
        sessionId: "call-reject-2",
        source: "native_reject_dup",
        hardClearedAt: new Map(),
        activeIncomingCallIds: new Set(),
        suppressMissedSound: new Set(),
      })
    ).not.toThrow();
    expect(isDibayCallConsumed("call-reject-2")).toBe(true);
  });
});
