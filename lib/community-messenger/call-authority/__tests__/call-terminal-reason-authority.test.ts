import { describe, expect, it } from "vitest";
import {
  isTrustedClientEndedReason,
  mapStoredToProductEndReason,
  resolveTerminalEndedReason,
} from "@/lib/community-messenger/call-authority/call-terminal-reason-authority";

describe("call-terminal-reason-authority", () => {
  it("maps reject/cancel/missed defaults", () => {
    expect(resolveTerminalEndedReason({ action: "reject", nextStatus: "rejected" })).toBe("declined");
    expect(resolveTerminalEndedReason({ action: "cancel", nextStatus: "cancelled" })).toBe("canceled");
    expect(resolveTerminalEndedReason({ action: "missed", nextStatus: "missed" })).toBe("missed");
    expect(resolveTerminalEndedReason({ action: "end", nextStatus: "ended" })).toBe("ended");
  });

  it("persists heartbeat_timeout and redial_replaced", () => {
    expect(
      resolveTerminalEndedReason({
        action: "end",
        nextStatus: "ended",
        clientEndedReason: "heartbeat_timeout",
      }),
    ).toBe("heartbeat_timeout");
    expect(
      resolveTerminalEndedReason({
        action: "end",
        nextStatus: "ended",
        clientEndedReason: "redial_replaced",
      }),
    ).toBe("redial_replaced");
  });

  it("ignores untrusted client reasons", () => {
    expect(isTrustedClientEndedReason("invented_reason")).toBe(false);
    expect(
      resolveTerminalEndedReason({
        action: "end",
        nextStatus: "ended",
        clientEndedReason: "invented_reason",
      }),
    ).toBe("ended");
  });

  it("maps product endReason labels", () => {
    expect(mapStoredToProductEndReason({ status: "cancelled", endedReason: "canceled" })).toBe(
      "caller_cancelled",
    );
    expect(mapStoredToProductEndReason({ status: "rejected", endedReason: "declined" })).toBe(
      "callee_rejected",
    );
    expect(mapStoredToProductEndReason({ status: "missed", endedReason: "missed" })).toBe("ring_timeout");
    expect(mapStoredToProductEndReason({ status: "ended", endedReason: "failed_network" })).toBe(
      "network_lost",
    );
  });
});
