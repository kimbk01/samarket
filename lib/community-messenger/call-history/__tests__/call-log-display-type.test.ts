import { describe, expect, it } from "vitest";
import {
  computeCallLogDisplayType,
  resolveCallLogBadgeMessageKey,
  resolveCallLogViewerCanonical,
} from "@/lib/community-messenger/call-history/call-log-display-type";
import { computeCallLogDisplayType as clientComputeCallLogDisplayType } from "@/lib/community-messenger/call-log-row-copy";
import { resolveCallEventCanonical } from "@/lib/community-messenger/call-event-presentation";
import type { CommunityMessengerCallStatus } from "@/lib/community-messenger/types";

const STATUSES: CommunityMessengerCallStatus[] = ["dialing", "incoming", "missed", "cancelled", "rejected", "ended"];

describe("call-log-display-type (통화 기록 viewer SSOT)", () => {
  it("client re-export is the same function as the SSOT used by the server", () => {
    expect(clientComputeCallLogDisplayType).toBe(computeCallLogDisplayType);
  });

  it("matches the timeline canonical resolver for every status × viewer role", () => {
    for (const status of STATUSES) {
      for (const isOutgoing of [true, false]) {
        expect(resolveCallLogViewerCanonical({ status, endedReason: null, isOutgoing })).toBe(
          resolveCallEventCanonical({
            resolvedEvent: null,
            callStatusFallback: status,
            viewerRole: isOutgoing ? "caller" : "callee",
          })
        );
      }
    }
  });

  it("maps viewer-aware display types", () => {
    expect(computeCallLogDisplayType("cancelled", null, true)).toBe("cancelled");
    expect(computeCallLogDisplayType("cancelled", null, false)).toBe("missed_incoming");
    expect(computeCallLogDisplayType("missed", "missed_timeout", true)).toBe("missed_outgoing");
    expect(computeCallLogDisplayType("missed", "missed_timeout", false)).toBe("missed_incoming");
    expect(computeCallLogDisplayType("rejected", null, true)).toBe("rejected");
    expect(computeCallLogDisplayType("rejected", null, false)).toBe("rejected");
    expect(computeCallLogDisplayType("ended", null, true)).toBe("outgoing");
    expect(computeCallLogDisplayType("ended", null, false)).toBe("incoming");
    expect(computeCallLogDisplayType("ended", "failed_media", true)).toBe("failed");
    expect(computeCallLogDisplayType("dialing", null, true)).toBe("outgoing");
    expect(computeCallLogDisplayType("incoming", null, false)).toBe("incoming");
  });

  it("badge keys distinguish 거절함 / 거절됨 and 응답 없음 / 부재중", () => {
    const badge = (status: CommunityMessengerCallStatus, isOutgoing: boolean) =>
      resolveCallLogBadgeMessageKey(
        resolveCallLogViewerCanonical({ status, endedReason: null, isOutgoing }),
        isOutgoing
      );
    expect(badge("rejected", false)).toBe("cm_call_status_rejected_by_me");
    expect(badge("rejected", true)).toBe("cm_call_status_rejected_by_peer");
    expect(badge("missed", true)).toBe("cm_call_status_no_answer");
    expect(badge("missed", false)).toBe("cm_call_status_missed");
    expect(badge("cancelled", true)).toBe("cm_call_status_cancelled");
    expect(badge("cancelled", false)).toBe("cm_call_status_missed");
    expect(badge("ended", true)).toBe("cm_call_status_outgoing_answered");
    expect(badge("ended", false)).toBe("cm_call_status_incoming_answered");
  });
});
