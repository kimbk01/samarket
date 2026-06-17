import { describe, expect, it } from "vitest";
import {
  buildCallHistorySubtitle,
  formatCallLogListTime,
  isCallLogMissedDisplayType,
  normalizeCommunityMessengerCallLog,
  resolveCallLogStatusMessageKey,
  shouldShowCallLogDuration,
} from "@/lib/community-messenger/call-log-row-copy";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

describe("call-log-row-copy", () => {
  it("maps call kind and display type to i18n keys", () => {
    expect(resolveCallLogStatusMessageKey("video", "missed_incoming")).toBe(
      "cm_ui_call_log_video_missed_incoming"
    );
    expect(resolveCallLogStatusMessageKey("voice", "outgoing")).toBe("cm_ui_call_log_voice_outgoing");
  });

  it("flags missed display types", () => {
    expect(isCallLogMissedDisplayType("missed_incoming")).toBe(true);
    expect(isCallLogMissedDisplayType("incoming")).toBe(false);
  });

  it("shows duration only for connected incoming/outgoing logs", () => {
    expect(shouldShowCallLogDuration("incoming", 42)).toBe(true);
    expect(shouldShowCallLogDuration("missed_incoming", 42)).toBe(false);
  });

  it("buildCallHistorySubtitle uses single message key and duration for answered calls", () => {
    const answered = buildCallHistorySubtitle({
      id: "1",
      sessionId: null,
      roomId: "r1",
      sessionMode: "direct",
      title: "t",
      peerLabel: "p",
      peerUserId: "u1",
      participantCount: 2,
      participantLabels: [],
      callKind: "voice",
      status: "ended",
      startedAt: new Date().toISOString(),
      durationSeconds: 125,
      endedAt: null,
      isOutgoing: true,
      endedReason: null,
      displayType: "outgoing",
      peerAvatarUrl: null,
    });
    expect(answered.messageKey).toBe("cm_ui_call_log_voice_outgoing");
    expect(answered.durationLabel).toBeTruthy();

    const cancelled = buildCallHistorySubtitle({
      id: "2",
      sessionId: null,
      roomId: "r1",
      sessionMode: "direct",
      title: "t",
      peerLabel: "p",
      peerUserId: "u1",
      participantCount: 2,
      participantLabels: [],
      callKind: "voice",
      status: "cancelled",
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      endedAt: null,
      isOutgoing: true,
      endedReason: null,
      displayType: "cancelled",
      peerAvatarUrl: null,
    });
    expect(cancelled.messageKey).toBe("cm_ui_call_log_voice_cancelled");
    expect(cancelled.durationLabel).toBeNull();
  });

  it("computes displayType for legacy payloads missing displayType", () => {
    const normalized = normalizeCommunityMessengerCallLog({
      id: "1",
      sessionId: null,
      roomId: "r1",
      sessionMode: "direct",
      title: "t",
      peerLabel: "p",
      peerUserId: "u1",
      participantCount: 2,
      participantLabels: [],
      callKind: "voice",
      status: "ended",
      startedAt: "2026-06-17T10:00:00.000Z",
      durationSeconds: 0,
      endedAt: "2026-06-17T10:02:05.000Z",
      isOutgoing: true,
      endedReason: null,
      displayType: undefined as never,
      peerAvatarUrl: null,
    });
    expect(normalized.displayType).toBe("outgoing");
    const subtitle = buildCallHistorySubtitle(normalized);
    expect(subtitle.durationLabel).toBeTruthy();
  });

  it("fills missing peerAvatarUrl for legacy payloads", () => {
    const legacy = {
      id: "1",
      sessionId: null,
      roomId: "r1",
      sessionMode: "direct",
      title: "t",
      peerLabel: "p",
      peerUserId: "u1",
      participantCount: 2,
      participantLabels: [],
      callKind: "voice",
      status: "ended",
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      endedAt: null,
      isOutgoing: true,
      endedReason: null,
      displayType: "outgoing",
    };

    expect(normalizeCommunityMessengerCallLog(legacy as unknown as CommunityMessengerCallLog).peerAvatarUrl).toBeNull();
  });

  it("formats same-day, yesterday, and older dates", () => {
    const now = new Date();
    const sameDayIso = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      10,
      54,
      0
    ).toISOString();
    expect(formatCallLogListTime(sameDayIso, "ko", "어제")).toMatch(/10:54|오전 10:54/);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatCallLogListTime(yesterday.toISOString(), "ko", "어제")).toBe("어제");

    const older = new Date(now.getFullYear(), 0, 7, 12, 0, 0);
    if (older.toDateString() !== now.toDateString() && older.toDateString() !== yesterday.toDateString()) {
      expect(formatCallLogListTime(older.toISOString(), "ko", "어제")).toMatch(/1월|7일/);
    }
  });
});
