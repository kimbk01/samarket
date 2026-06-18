import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveCallSessionCallId,
  resetActiveCallSessionForTests,
  setActiveCallSession,
} from "@/lib/call/active-call-session";
import {
  acquireCallActionLock,
  releaseCallActionLock,
  resetCallActionLockForTests,
} from "@/lib/call/call-action-lock";
import { guardInstantOutgoingCallStart } from "@/lib/call/outgoing-call-start-guard";

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => ({ id: "user-1", phone_verified: true }),
}));

vi.mock("@/lib/auth/phone-verification-required-client", () => ({
  openPhoneVerificationRequiredSheet: vi.fn(),
}));

describe("outgoing call start reuse guard", () => {
  beforeEach(() => {
    resetActiveCallSessionForTests();
    resetCallActionLockForTests();
  });

  it("blocks when activeCallSession has live callId", () => {
    setActiveCallSession({
      callId: "live-1",
      roomId: "room-1",
      peerUserId: "peer-1",
      role: "caller",
      mediaType: "voice",
      phase: "ringing",
    });
    const guard = guardInstantOutgoingCallStart({ roomId: "room-2", kind: "voice" });
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.blockedCallId).toBe("live-1");
    }
  });

  it("blocks when call action lock is held", () => {
    const lock = acquireCallActionLock({ roomId: "room-1", mediaType: "voice" });
    expect(lock.ok).toBe(true);
    const guard = guardInstantOutgoingCallStart({ roomId: "room-1", kind: "voice" });
    expect(guard.ok).toBe(false);
    releaseCallActionLock("test");
    expect(getActiveCallSessionCallId()).toBeNull();
  });
});
