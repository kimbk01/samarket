import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  startCallEngineIncomingRingtone,
  stopCallEngineIncomingRingtone,
} from "@/lib/community-messenger/call-engine/call-engine-ringtone-owner";
import {
  markCallEngineTerminalConsumed,
  resetCallEngineLocksForTests,
} from "@/lib/community-messenger/call-engine/call-engine-locks";

const syncIncomingCallRing = vi.fn();
const stopIncomingCallRing = vi.fn();

vi.mock("@/lib/community-messenger/incoming-call/ring-owner", () => ({
  syncIncomingCallRing: (...args: unknown[]) => syncIncomingCallRing(...args),
  stopIncomingCallRing: (...args: unknown[]) => stopIncomingCallRing(...args),
}));

describe("call-engine ringtone owner", () => {
  beforeEach(() => {
    resetCallEngineLocksForTests();
    syncIncomingCallRing.mockReset();
    stopIncomingCallRing.mockReset();
  });

  it("starts ringtone once per callId", () => {
    const hard = new Map<string, number>();
    expect(startCallEngineIncomingRingtone({ callId: "c1", callKind: "voice", hardClearedAt: hard, source: "test" })).toBe(
      true,
    );
    expect(startCallEngineIncomingRingtone({ callId: "c1", callKind: "voice", hardClearedAt: hard, source: "test" })).toBe(
      false,
    );
    expect(syncIncomingCallRing).toHaveBeenCalledTimes(1);
  });

  it("stops ringtone via owner API", () => {
    stopCallEngineIncomingRingtone("c2", "terminal");
    expect(stopIncomingCallRing).toHaveBeenCalledWith("terminal", "c2");
  });

  it("does not restart ringtone after terminal", () => {
    const hard = new Map<string, number>();
    markCallEngineTerminalConsumed("c3");
    expect(startCallEngineIncomingRingtone({ callId: "c3", callKind: "voice", hardClearedAt: hard, source: "test" })).toBe(
      false,
    );
    expect(syncIncomingCallRing).not.toHaveBeenCalled();
  });
});
