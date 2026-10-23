import { describe, expect, it } from "vitest";
import { mapCallV4RemoteTerminalReason } from "@/lib/community-messenger/call-v4/map-call-v4-remote-terminal-reason";
import { mapTerminalReasonToCallInAppNoticeEvent } from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";

describe("mapCallV4RemoteTerminalReason (C2-A)", () => {
  it("keeps known terminals", () => {
    expect(mapCallV4RemoteTerminalReason("rejected")).toBe("rejected");
    expect(mapCallV4RemoteTerminalReason("ended")).toBe("ended");
    expect(mapCallV4RemoteTerminalReason("cancelled")).toBe("cancelled");
    expect(mapCallV4RemoteTerminalReason("canceled")).toBe("cancelled");
    expect(mapCallV4RemoteTerminalReason("failed")).toBe("failed");
    expect(mapCallV4RemoteTerminalReason("failed_or_stale")).toBe("failed");
  });

  it("maps outgoing missed to no_answer; incoming missed stays missed", () => {
    expect(mapCallV4RemoteTerminalReason("missed", "outgoing")).toBe("no_answer");
    expect(mapCallV4RemoteTerminalReason("missed", "incoming")).toBe("missed");
    expect(mapCallV4RemoteTerminalReason("missed", null)).toBe("missed");
  });

  it("C2-A: unknown / live statuses never become rejected", () => {
    for (const status of ["", "  ", "ringing", "active", "bogus", "unknown", null, undefined]) {
      const mapped = mapCallV4RemoteTerminalReason(status as string | null | undefined);
      expect(mapped).toBe("ended");
      expect(mapped).not.toBe("rejected");
      expect(mapTerminalReasonToCallInAppNoticeEvent(mapped)).toBeNull();
    }
  });

  it("known busy/no_answer notice paths unchanged via contract", () => {
    expect(mapTerminalReasonToCallInAppNoticeEvent("peer_busy")).toBe("peer_busy");
    expect(mapTerminalReasonToCallInAppNoticeEvent("caller_busy")).toBe("caller_busy");
    expect(mapTerminalReasonToCallInAppNoticeEvent("no_answer")).toBe("no_answer");
    expect(mapTerminalReasonToCallInAppNoticeEvent("rejected")).toBe("peer_declined");
  });
});
