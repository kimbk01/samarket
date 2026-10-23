import { describe, expect, it } from "vitest";
import {
  busyEndedReasonForKind,
  busyKindFromEndedReason,
  isCallerOnlyBusyEndedReason,
  shouldIncludeCallLogRowForViewer,
} from "@/lib/community-messenger/call-busy-attempt-record";
import {
  callLogDisplayTypeFromCanonical,
  resolveCallLogBadgeMessageKey,
  resolveCallLogViewerCanonical,
} from "@/lib/community-messenger/call-history/call-log-display-type";
import { shouldPersistCallStubProjection } from "@/lib/community-messenger/call-authority/call-chat-projection-authority";
import { resolveCanonicalTerminalReason } from "@/lib/community-messenger/call-authority/call-terminal-reason-authority";
import { mapTerminalReasonToCallInAppNoticeEvent } from "@/lib/community-messenger/call-ui/call-in-app-notice-contract";

describe("E-C1 busy attempt record helpers", () => {
  it("maps busyKind → ended_reason wire", () => {
    expect(busyEndedReasonForKind("peer")).toBe("peer_busy");
    expect(busyEndedReasonForKind("caller")).toBe("caller_busy");
  });

  it("caller-only filter hides busy rows from peer viewer", () => {
    expect(
      shouldIncludeCallLogRowForViewer({
        viewerUserId: "caller",
        callerUserId: "caller",
        endedReason: "peer_busy",
      })
    ).toBe(true);
    expect(
      shouldIncludeCallLogRowForViewer({
        viewerUserId: "peer",
        callerUserId: "caller",
        endedReason: "peer_busy",
      })
    ).toBe(false);
    expect(
      shouldIncludeCallLogRowForViewer({
        viewerUserId: "peer",
        callerUserId: "caller",
        endedReason: "caller_busy",
      })
    ).toBe(false);
    expect(
      shouldIncludeCallLogRowForViewer({
        viewerUserId: "peer",
        callerUserId: "caller",
        endedReason: "missed",
      })
    ).toBe(true);
  });

  it("does not project shared call_stub for busy canonical", () => {
    expect(
      shouldPersistCallStubProjection({
        sessionId: "s1",
        roomId: "r1",
        status: "cancelled",
        canonical: "busy",
      })
    ).toBe(false);
  });

  it("canonical busy from peer_busy and caller_busy wires", () => {
    expect(resolveCanonicalTerminalReason({ status: "cancelled", endedReason: "peer_busy" })).toBe(
      "busy"
    );
    expect(resolveCanonicalTerminalReason({ status: "cancelled", endedReason: "caller_busy" })).toBe(
      "busy"
    );
    expect(busyKindFromEndedReason("caller_busy")).toBe("caller");
    expect(isCallerOnlyBusyEndedReason("peer_busy")).toBe(true);
  });

  it("call history display is busy (not failed) with distinct badges", () => {
    expect(
      resolveCallLogViewerCanonical({
        status: "cancelled",
        endedReason: "peer_busy",
        isOutgoing: true,
      })
    ).toBe("remote_busy");
    expect(
      resolveCallLogViewerCanonical({
        status: "cancelled",
        endedReason: "caller_busy",
        isOutgoing: true,
      })
    ).toBe("self_busy");
    expect(callLogDisplayTypeFromCanonical("remote_busy", true)).toBe("busy");
    expect(callLogDisplayTypeFromCanonical("self_busy", true)).toBe("busy");
    expect(resolveCallLogBadgeMessageKey("remote_busy", true)).toBe("cm_call_status_busy_peer");
    expect(resolveCallLogBadgeMessageKey("self_busy", true)).toBe("cm_call_status_busy_self");
  });

  it("in-app notice: peer vs caller copy events; API error code stays peer_busy class", () => {
    expect(mapTerminalReasonToCallInAppNoticeEvent("peer_busy")).toBe("peer_busy");
    expect(mapTerminalReasonToCallInAppNoticeEvent("caller_busy")).toBe("caller_busy");
  });
});
