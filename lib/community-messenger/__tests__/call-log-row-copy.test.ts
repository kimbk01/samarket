import { describe, expect, it } from "vitest";
import {
  buildCallHistorySubtitle,
  enrichCommunityMessengerCallLogsWithProfiles,
  formatCallLogListTime,
  formatCallPeerDetailRowTime,
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
    /** 발신자 미응답은 「응답 없음」 — 부재중 아님 */
    expect(isCallLogMissedDisplayType("missed_outgoing")).toBe(false);
    expect(isCallLogMissedDisplayType("incoming")).toBe(false);
  });

  it("shows duration only for connected incoming/outgoing logs", () => {
    expect(shouldShowCallLogDuration("incoming", 42)).toBe(true);
    expect(shouldShowCallLogDuration("missed_incoming", 42)).toBe(false);
  });

  it("buildCallHistorySubtitle uses call-kind key (status lives in badge) and duration for answered calls", () => {
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
    expect(answered.messageKey).toBe("cm_ui_call_log_kind_voice");
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
    expect(cancelled.messageKey).toBe("cm_ui_call_log_kind_voice");
    expect(cancelled.durationLabel).toBeNull();
  });

  // Owner 2026-11-13: 발신자 취소의 수신자 = 부재중
  it("normalize recomputes displayType from status (callee of caller-cancel → missed_incoming)", () => {
    const normalized = normalizeCommunityMessengerCallLog({
      id: "3",
      sessionId: null,
      roomId: "r1",
      sessionMode: "direct",
      title: "t",
      peerLabel: "p",
      peerUserId: "u1",
      participantCount: 2,
      participantLabels: [],
      callKind: "video",
      status: "cancelled",
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      endedAt: null,
      isOutgoing: false,
      endedReason: null,
      displayType: "missed_incoming",
      peerAvatarUrl: null,
    });
    expect(normalized.displayType).toBe("missed_incoming");
    expect(buildCallHistorySubtitle(normalized).messageKey).toBe("cm_ui_call_log_kind_video");
  });

  it("does not invent duration from ringing startedAt when durationSeconds is 0", () => {
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
    expect(subtitle.durationLabel).toBeNull();
  });

  it("enriches peerPublicId and peerAvatarUrl from friend profiles", () => {
    const enriched = enrichCommunityMessengerCallLogsWithProfiles(
      [
        normalizeCommunityMessengerCallLog({
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
          peerAvatarUrl: null,
        }),
      ],
      [{ id: "u1", label: "테스트", subtitle: "@aa11", avatarUrl: "/avatars/u1.jpg", following: false, blocked: false, isFriend: true, isFavoriteFriend: false }]
    );
    expect(enriched[0]?.peerPublicId).toBe("aa11");
    expect(enriched[0]?.peerAvatarUrl).toBe("/avatars/u1.jpg");
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
    /** P4-B (Owner 2026-11-18): 시각은 화면 언어 — ko 「오전 10:54」 / en 「10:54 AM」 */
    expect(formatCallLogListTime(sameDayIso, "ko", "어제")).toBe("오전 10:54");
    expect(formatCallLogListTime(sameDayIso, "en", "Yesterday")).toBe("10:54 AM");

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatCallLogListTime(yesterday.toISOString(), "ko", "어제")).toMatch(/^어제 오[전후] \d{1,2}:\d{2}$/);

    const older = new Date(now.getFullYear(), 0, 7, 12, 0, 0);
    if (older.toDateString() !== now.toDateString() && older.toDateString() !== yesterday.toDateString()) {
      const olderLabel = formatCallLogListTime(older.toISOString(), "ko", "어제");
      expect(olderLabel).toMatch(/1월|7일/);
      expect(olderLabel).toMatch(/오후 12:00$/);
    }
  });

  it("상대 통화 상세 행 시각 — 화면 언어 (P4-B)", () => {
    const iso = new Date(2026, 10, 18, 2, 16, 0).toISOString();
    expect(formatCallPeerDetailRowTime(iso, "ko")).toBe("오전 2:16");
    expect(formatCallPeerDetailRowTime(iso, "en")).toBe("2:16 AM");
  });
});
