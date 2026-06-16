import { describe, expect, it } from "vitest";
import { normalizeFcmCallEvent } from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";
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
});
