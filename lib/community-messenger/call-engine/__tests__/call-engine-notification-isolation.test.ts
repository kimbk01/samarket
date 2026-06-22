import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCallEngineState, resetCallEngineStateForTests } from "@/lib/community-messenger/call-engine/call-engine-state";
import {
  isCallEngineTerminalConsumed,
  markCallEngineTerminalConsumed,
  resetCallEngineLocksForTests,
  tryLockCallEngineRingbackOwnerOnce,
  tryLockCallEngineRingtoneOwnerOnce,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import { dispatchCallEngineSignal, resetCallEngineControllerForTests } from "@/lib/community-messenger/call-engine/call-engine-controller";

vi.mock("@/lib/community-messenger/call-engine/call-engine-actions", () => ({
  callEngineAcceptIncoming: vi.fn(async () => ({ ok: true })),
  runCallEnginePatchAction: vi.fn(async () => ({ ok: true })),
  runCallEngineLeavePatchAction: vi.fn(async () => ({ ok: true })),
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

describe("call-engine notification isolation", () => {
  beforeEach(() => {
    resetCallEngineLocksForTests();
    resetCallEngineStateForTests();
    resetCallEngineControllerForTests();
  });

  it("does not change call engine phase when only badge-related code paths run", () => {
    const phaseBefore = getCallEngineState("c-badge");
    expect(phaseBefore).toBe("idle");
    // badge store updates must not touch call engine — simulate no signal
    expect(getCallEngineState("c-badge")).toBe("idle");
  });

  it("blocks incoming rediscovery after terminal consumed (missed notification must not reopen UI)", async () => {
    markCallEngineTerminalConsumed("c-missed");
    const res = await dispatchCallEngineSignal({
      type: "incoming_discovered",
      session: {
        id: "c-missed",
        roomId: "r1",
        status: "ringing",
        isMineInitiator: false,
        callKind: "voice",
        sessionMode: "direct",
        initiatorUserId: "u1",
        recipientUserId: "u2",
        peerUserId: "u1",
        peerLabel: "peer",
        startedAt: new Date().toISOString(),
      } as never,
      appVisibility: "foreground",
      hardClearedAt: new Map(),
      source: "missed_notification_reopen",
    });
    expect(res.ok).toBe(false);
    expect(isCallEngineTerminalConsumed("c-missed")).toBe(true);
  });

  it("keeps ringtone and ringback owners separate per callId", () => {
    expect(tryLockCallEngineRingtoneOwnerOnce("c1")).toBe(true);
    expect(tryLockCallEngineRingbackOwnerOnce("c1")).toBe(true);
    expect(tryLockCallEngineRingtoneOwnerOnce("c1")).toBe(false);
    expect(tryLockCallEngineRingbackOwnerOnce("c1")).toBe(false);
  });
});
