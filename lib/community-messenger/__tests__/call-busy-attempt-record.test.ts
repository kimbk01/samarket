import { readFileSync } from "node:fs";
import path from "node:path";
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

  it("call history filter: peer_busy 양쪽 · caller_busy 발신자만 (Owner 2026-11-15 1단계)", () => {
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
    ).toBe(true);
    expect(
      shouldIncludeCallLogRowForViewer({
        viewerUserId: "caller",
        callerUserId: "caller",
        endedReason: "caller_busy",
      })
    ).toBe(true);
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

  it("shared call_stub: peer_busy 만 기록, caller_busy·사유 모름은 기록 안 함", () => {
    const base = { sessionId: "s1", roomId: "r1", status: "cancelled", canonical: "busy" as const };
    expect(shouldPersistCallStubProjection({ ...base, endedReason: "peer_busy" })).toBe(true);
    expect(shouldPersistCallStubProjection({ ...base, endedReason: "callee_busy" })).toBe(true);
    expect(shouldPersistCallStubProjection({ ...base, endedReason: "caller_busy" })).toBe(false);
    expect(shouldPersistCallStubProjection(base)).toBe(false);
  });

  it("canonical busy from peer_busy and caller_busy wires", () => {
    expect(resolveCanonicalTerminalReason({ status: "cancelled", endedReason: "peer_busy" })).toBe(
      "busy"
    );
    expect(resolveCanonicalTerminalReason({ status: "cancelled", endedReason: "caller_busy" })).toBe(
      "busy"
    );
    expect(busyKindFromEndedReason("caller_busy")).toBe("caller");
    expect(isCallerOnlyBusyEndedReason("peer_busy")).toBe(false);
    expect(isCallerOnlyBusyEndedReason("caller_busy")).toBe(true);
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
    // 통화 중이던 사람(수신자) 통화 기록 = 부재중
    expect(
      resolveCallLogViewerCanonical({
        status: "cancelled",
        endedReason: "peer_busy",
        isOutgoing: false,
      })
    ).toBe("incoming_missed");
    expect(callLogDisplayTypeFromCanonical("incoming_missed", false)).toBe("missed_incoming");
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

describe("서버 busy 기록 경로 계약 (Owner 2026-11-15 1단계)", () => {
  const src = readFileSync(
    path.join(process.cwd(), "lib/community-messenger/service.ts"),
    "utf8",
  );
  const start = src.indexOf("async function persistBusyCallAttemptForCaller(");
  const end = src.indexOf("async function rejectStartCallPeerBusy(");
  const body = src.slice(start, end);

  it("상대 통화 중만 공유 기록 + 부재중 알림, 본인 통화 중은 발신자 전용", () => {
    expect(start).toBeGreaterThan(0);
    expect(body).toContain('const sharedWithPeer = input.busyKind === "peer";');
    expect(body).toContain("projectCallStub: sharedWithPeer,");
    expect(body).toContain('projectCallStub: input.busyKind === "peer",');
    expect(body).toMatch(/if \(sharedWithPeer && peerUserId\) \{\s*scheduleBusyAttemptMissedCallNotification\(/);
  });

  it("부재중 알림은 기존 판정 함수(notifyRoomBoundMissedCallBestEffort)만 거치고 수신 푸시는 부르지 않는다", () => {
    expect(body).toContain("notifyRoomBoundMissedCallBestEffort(row, mapped)");
    expect(body).not.toContain("startIncomingCallVoipDispatchDetached");
    expect(body).not.toContain("dispatchIncomingCall");
  });
});

describe("화면 문구 — 상대 통화 중은 보는 사람에 따라 (Owner 2026-11-15 1단계)", () => {
  it("발신자 통화 중 · 통화 중이던 사람 부재중 · 본인 통화 중은 그대로", async () => {
    const { resolveCallEventCanonical } = await import("@/lib/community-messenger/call-event-presentation");
    expect(resolveCallEventCanonical({ resolvedEvent: "peer_busy", viewerRole: "caller" })).toBe("remote_busy");
    expect(resolveCallEventCanonical({ resolvedEvent: "peer_busy", viewerRole: "callee" })).toBe("incoming_missed");
    expect(resolveCallEventCanonical({ resolvedEvent: "peer_busy", viewerRole: null })).toBe("remote_busy");
    expect(resolveCallEventCanonical({ resolvedEvent: "caller_busy", viewerRole: "callee" })).toBe("self_busy");
  });
});
