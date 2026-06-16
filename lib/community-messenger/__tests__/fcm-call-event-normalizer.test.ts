import { describe, expect, it } from "vitest";
import { normalizeFcmCallEvent, resolveIncomingCallWake, sealFcmTerminalEvent } from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";
import { latchCallTerminal } from "@/lib/community-messenger/call-state/call-terminal-tombstone";

describe("fcm-call-event-normalizer", () => {
  it("incoming_call before terminal → wake_incoming", () => {
    const hard = new Map<string, number>();
    const result = normalizeFcmCallEvent(
      { type: "incoming_call", callId: "fcm-wake-1" },
      { hardClearedAt: hard }
    );
    expect(result).toEqual({
      action: "wake_incoming",
      callId: "fcm-wake-1",
      fcmType: "incoming_call",
      callPushKind: undefined,
    });
  });

  it("terminal FCM → terminal action", () => {
    const hard = new Map<string, number>();
    const result = normalizeFcmCallEvent(
      { type: "call_canceled", callId: "fcm-term-1" },
      { hardClearedAt: hard }
    );
    expect(result.action).toBe("terminal");
    if (result.action === "terminal") {
      expect(result.terminalKind).toBe("cancelled");
      expect(result.callId).toBe("fcm-term-1");
    }
  });

  it("incoming_call after terminal latch → ignored (terminal_tombstone)", () => {
    const hard = new Map<string, number>();
    const callId = "fcm-after-term-1";
    latchCallTerminal(callId, "cancelled", { hardClearedAt: hard });
    const result = normalizeFcmCallEvent(
      { type: "incoming_call", callId },
      { hardClearedAt: hard }
    );
    expect(result).toEqual({
      action: "ignore",
      callId,
      reason: "terminal_tombstone",
      fcmType: "incoming_call",
    });
  });

  it("call_terminal native inject maps to terminal action", () => {
    const hard = new Map<string, number>();
    const result = normalizeFcmCallEvent(
      { type: "call_terminal", sessionId: "fcm-native-term-1", status: "ended" },
      { hardClearedAt: hard }
    );
    expect(result.action).toBe("terminal");
    if (result.action === "terminal") {
      expect(result.terminalKind).toBe("ended");
      expect(result.callId).toBe("fcm-native-term-1");
    }
  });

  it("sealFcmTerminalEvent delegates to sealIncomingCallTerminal", () => {
    const hard = new Map<string, number>();
    const sid = sealFcmTerminalEvent(
      { action: "terminal", callId: "fcm-seal-1", terminalKind: "cancelled", fcmType: "call_canceled" },
      hard,
      "fcm_cancel_wake"
    );
    expect(sid).toBe("fcm-seal-1");
    expect(hard.get("fcm-seal-1")).toBeTypeOf("number");
  });

  it("resolveIncomingCallWake blocks tombstone then native consumed", async () => {
    const hard = new Map<string, number>();
    const callId = "wake-resolve-1";
    latchCallTerminal(callId, "ended", { hardClearedAt: hard });
    const tombstone = { hardClearedAt: hard };
    const tombstoneBlocked = await resolveIncomingCallWake(callId, tombstone, async () => false);
    expect(tombstoneBlocked).toEqual({ proceed: false, callId, reason: "terminal_tombstone" });

    const freshId = "wake-resolve-2";
    const nativeBlocked = await resolveIncomingCallWake(freshId, tombstone, async () => true);
    expect(nativeBlocked).toEqual({ proceed: false, callId: freshId, reason: "native_consumed" });

    const allowed = await resolveIncomingCallWake(freshId, tombstone, async () => false);
    expect(allowed).toEqual({ proceed: true, callId: freshId });
  });
});
