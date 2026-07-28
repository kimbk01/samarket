import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  startOutgoingRingback,
  stopOutgoingRingback,
  stopAllOutgoingRingback,
  startWebOutgoingRingbackIfAllowed,
  invalidateWebOutgoingRingbackOwnership,
  isCallEngineTerminalConsumed,
  tryLockCallEngineRingbackOwnerOnce,
  getCallEngineState,
} = vi.hoisted(() => ({
  startOutgoingRingback: vi.fn(),
  stopOutgoingRingback: vi.fn(),
  stopAllOutgoingRingback: vi.fn(),
  startWebOutgoingRingbackIfAllowed: vi.fn(),
  invalidateWebOutgoingRingbackOwnership: vi.fn(),
  isCallEngineTerminalConsumed: vi.fn(() => false),
  tryLockCallEngineRingbackOwnerOnce: vi.fn(() => true),
  getCallEngineState: vi.fn((): string => "outgoing_ringing"),
}));

vi.mock("@/lib/community-messenger/call-outgoing-ringback-controller", () => ({
  startOutgoingRingback,
  stopOutgoingRingback,
  stopAllOutgoingRingback,
}));

vi.mock("@/lib/community-messenger/call-outgoing-ringback-ownership", () => ({
  startWebOutgoingRingbackIfAllowed,
  invalidateWebOutgoingRingbackOwnership,
}));

vi.mock("@/lib/community-messenger/call-engine/call-engine-locks", () => ({
  isCallEngineTerminalConsumed,
  isCallEngineRingbackOwner: vi.fn(() => false),
  tryLockCallEngineRingbackOwnerOnce,
  tryLockCallEngineRingtoneOwnerOnce: vi.fn(() => true),
}));

vi.mock("@/lib/community-messenger/call-engine/call-engine-state", () => ({
  getCallEngineState,
}));

vi.mock("@/lib/community-messenger/call-engine/call-engine-audit-log", () => ({
  logSoundState: vi.fn(),
}));

vi.mock("@/lib/community-messenger/incoming-call/ring-owner", () => ({
  stopIncomingCallRing: vi.fn(),
  syncIncomingCallRing: vi.fn(),
}));

import {
  startCallEngineOutgoingRingback,
  stopCallEngineOutgoingRingback,
} from "@/lib/community-messenger/call-engine/call-engine-ringtone-owner";

describe("call-engine outgoing ringback ownership gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCallEngineTerminalConsumed.mockReturnValue(false);
    tryLockCallEngineRingbackOwnerOnce.mockReturnValue(true);
    getCallEngineState.mockReturnValue("outgoing_ringing");
    startWebOutgoingRingbackIfAllowed.mockImplementation(
      (args: { isStillValid: () => boolean; start: () => void }) => {
        if (!args.isStillValid()) return "stale";
        args.start();
        return "started";
      }
    );
  });

  it("does not start when terminal consumed", () => {
    isCallEngineTerminalConsumed.mockReturnValue(true);
    expect(
      startCallEngineOutgoingRingback({ callId: "c1", kind: "voice", source: "test" })
    ).toBe(false);
    expect(startWebOutgoingRingbackIfAllowed).not.toHaveBeenCalled();
  });

  it("gates through ownership helper then locks + starts", () => {
    expect(
      startCallEngineOutgoingRingback({ callId: "c1", kind: "voice", source: "eng" })
    ).toBe(true);
    expect(startWebOutgoingRingbackIfAllowed).toHaveBeenCalledTimes(1);
    expect(tryLockCallEngineRingbackOwnerOnce).toHaveBeenCalledWith("c1");
    expect(startOutgoingRingback).toHaveBeenCalledWith({
      callId: "c1",
      kind: "voice",
      source: "eng",
    });
  });

  it("stale after connected: isStillValid blocks start inside gate", () => {
    getCallEngineState.mockReturnValue("connected");
    startWebOutgoingRingbackIfAllowed.mockImplementation(
      (args: { isStillValid: () => boolean; start: () => void }) => {
        expect(args.isStillValid()).toBe(false);
        return "stale";
      }
    );
    expect(
      startCallEngineOutgoingRingback({ callId: "c1", kind: "voice", source: "late" })
    ).toBe(false);
    expect(startOutgoingRingback).not.toHaveBeenCalled();
  });

  it("stop invalidates ownership then stops tone", () => {
    stopCallEngineOutgoingRingback("c1", "rejected");
    expect(invalidateWebOutgoingRingbackOwnership).toHaveBeenCalledWith("c1");
    expect(stopOutgoingRingback).toHaveBeenCalledWith("c1", "rejected");
  });
});
