import { describe, expect, it } from "vitest";
import { presentCallHistoryRow, presentCallHistoryStatus } from "@/lib/community-messenger/call-history/call-history-presenter";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

function baseCall(partial: Partial<CommunityMessengerCallLog>): CommunityMessengerCallLog {
  return {
    id: "c1",
    sessionId: null,
    roomId: "room-1",
    sessionMode: "direct",
    title: "Peer",
    peerLabel: "Peer",
    peerUserId: "peer-1",
    participantCount: 2,
    participantLabels: [],
    callKind: "voice",
    status: "cancelled",
    startedAt: "2026-06-16T10:00:00.000Z",
    durationSeconds: 0,
    endedAt: null,
    isOutgoing: true,
    endedReason: null,
    displayType: "cancelled",
    peerAvatarUrl: null,
    ...partial,
  };
}

describe("call-history-presenter", () => {
  it("maps display types to colors", () => {
    expect(presentCallHistoryStatus("outgoing").color).toBe("#006241");
    expect(presentCallHistoryStatus("missed_incoming").color).toBe("#E53935");
    expect(presentCallHistoryStatus("cancelled").color).toBe("#6B7280");
    expect(presentCallHistoryStatus("rejected").color).toBe("#FB8C00");
  });

  it("uses single subtitle message key without duplicate status fields", () => {
    const vm = presentCallHistoryRow(baseCall({ displayType: "cancelled", callKind: "voice" }));
    expect(vm.displayType).toBe("cancelled");
    expect(vm.badgeLabelKey).toBe("cm_call_status_cancelled");
    /** 부제는 통화 종류만 — 배지와 상태 문구 중복 금지 */
    expect(vm.subtitleMessageKey).toBe("cm_ui_call_log_kind_voice");
    expect(vm.durationLabel).toBeNull();
    expect(vm.subtitleColor).toBe("#6B7280");
  });

  it("marks missed calls and avatar overlay", () => {
    const vm = presentCallHistoryRow(
      baseCall({ status: "missed", displayType: "missed_incoming", isOutgoing: false, callKind: "video" })
    );
    expect(vm.isMissed).toBe(true);
    expect(vm.avatarOverlayKind).toBe("missed");
    expect(vm.badgeLabelKey).toBe("cm_call_status_missed");
    expect(vm.subtitleMessageKey).toBe("cm_ui_call_log_kind_video");
  });

  it("sets direction overlay for answered direct calls", () => {
    const outgoing = presentCallHistoryRow(
      baseCall({ status: "ended", displayType: "outgoing", durationSeconds: 90 })
    );
    expect(outgoing.avatarOverlayKind).toBe("outgoing");
    expect(outgoing.durationLabel).toBeTruthy();

    const incoming = presentCallHistoryRow(
      baseCall({ status: "ended", displayType: "incoming", isOutgoing: false, durationSeconds: 60 })
    );
    expect(incoming.avatarOverlayKind).toBe("incoming");
    expect(outgoing.badgeLabelKey).toBe("cm_call_status_outgoing_answered");
    expect(incoming.badgeLabelKey).toBe("cm_call_status_incoming_answered");
  });

  it("caller cancel: caller sees 취소됨, callee sees 부재중 (viewer-aware, timeline 과 동일)", () => {
    const caller = presentCallHistoryRow(baseCall({ status: "cancelled", isOutgoing: true }));
    expect(caller.displayType).toBe("cancelled");
    expect(caller.badgeLabelKey).toBe("cm_call_status_cancelled");
    expect(caller.isMissed).toBe(false);

    /** 구 캐시 payload 의 viewer 비인지 displayType("cancelled") 도 교정 */
    const callee = presentCallHistoryRow(
      baseCall({ status: "cancelled", isOutgoing: false, displayType: "cancelled" })
    );
    expect(callee.displayType).toBe("missed_incoming");
    expect(callee.badgeLabelKey).toBe("cm_call_status_missed");
    expect(callee.isMissed).toBe(true);
    expect(callee.avatarOverlayKind).toBe("missed");
  });

  it("missed: caller sees 응답 없음 (not missed), callee sees 부재중", () => {
    const caller = presentCallHistoryRow(baseCall({ status: "missed", isOutgoing: true }));
    expect(caller.displayType).toBe("missed_outgoing");
    expect(caller.badgeLabelKey).toBe("cm_call_status_no_answer");
    expect(caller.isMissed).toBe(false);
    expect(caller.avatarOverlayKind).toBe("outgoing");

    const callee = presentCallHistoryRow(baseCall({ status: "missed", isOutgoing: false }));
    expect(callee.displayType).toBe("missed_incoming");
    expect(callee.badgeLabelKey).toBe("cm_call_status_missed");
    expect(callee.isMissed).toBe(true);
  });

  it("rejected: callee sees 거절함, caller sees 거절됨", () => {
    const callee = presentCallHistoryRow(baseCall({ status: "rejected", isOutgoing: false }));
    expect(callee.displayType).toBe("rejected");
    expect(callee.badgeLabelKey).toBe("cm_call_status_rejected_by_me");
    const caller = presentCallHistoryRow(baseCall({ status: "rejected", isOutgoing: true }));
    expect(caller.displayType).toBe("rejected");
    expect(caller.badgeLabelKey).toBe("cm_call_status_rejected_by_peer");
  });
});
