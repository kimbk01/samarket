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
    status: "ended",
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
    expect(vm.subtitleMessageKey).toBe("cm_ui_call_log_voice_cancelled");
    expect(vm.durationLabel).toBeNull();
    expect(vm.subtitleColor).toBe("#6B7280");
  });

  it("marks missed calls and avatar overlay", () => {
    const vm = presentCallHistoryRow(
      baseCall({ displayType: "missed_incoming", isOutgoing: false, callKind: "video" })
    );
    expect(vm.isMissed).toBe(true);
    expect(vm.avatarOverlayKind).toBe("missed");
    expect(vm.subtitleMessageKey).toBe("cm_ui_call_log_video_missed_incoming");
  });

  it("sets direction overlay for answered direct calls", () => {
    const outgoing = presentCallHistoryRow(
      baseCall({ displayType: "outgoing", durationSeconds: 90 })
    );
    expect(outgoing.avatarOverlayKind).toBe("outgoing");
    expect(outgoing.durationLabel).toBeTruthy();

    const incoming = presentCallHistoryRow(
      baseCall({ displayType: "incoming", isOutgoing: false, durationSeconds: 60 })
    );
    expect(incoming.avatarOverlayKind).toBe("incoming");
  });
});
