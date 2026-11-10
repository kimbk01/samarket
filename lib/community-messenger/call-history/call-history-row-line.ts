import type { MessageKey } from "@/lib/i18n/messages";
import {
  formatChatListKakaoDateTime,
  type ChatListTimeTranslate,
} from "@/lib/community-messenger/chat-list/chat-list-kakao-time";
import { isCallLogMissedDisplayType } from "@/lib/community-messenger/call-log-row-copy";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallLogDisplayType,
} from "@/lib/community-messenger/types";

const SEPARATOR = " · ";

export type CallHistoryRowLineInput = {
  callKind: CommunityMessengerCallKind;
  displayType: CommunityMessengerCallLogDisplayType;
  /** viewer 관점 결과 글자 키 (`presentCallHistoryRow().badgeLabelKey` — 취소·거절·부재중·통화 중 …) */
  badgeLabelKey: MessageKey;
  /** 연결된 통화의 통화 시간 (`presentCallHistoryRow().durationLabel`) — 있으면 결과 대신 */
  durationLabel: string | null;
  /** 통화 시각 ISO (`resolveCallLogListTimestampIso`) */
  timeIso: string | null | undefined;
};

/**
 * 통화 탭 두 번째 줄 (채팅 시안 4판 「3. 통화 탭」, Owner 「정확히 시안대로」 2026-11-10).
 * - 「음성 · 취소 · 어제 오전 2:50」 · 「영상 · 6분 56초 · 오전 9:54」
 * - 놓친 수신(부재중)만 「부재중 음성 · 11월 8일 오후 9:29」 + 빨강(`missed`)
 * 시각은 날짜+시각(`formatChatListKakaoDateTime`) — 오른쪽 따로 두지 않아 화면 밖으로 나가지 않는다.
 */
export function formatCallHistoryRowLine(
  input: CallHistoryRowLineInput,
  tr: ChatListTimeTranslate,
  now: Date = new Date()
): { text: string; missed: boolean } {
  const missed = isCallLogMissedDisplayType(input.displayType);
  const video = input.callKind === "video";
  const time = formatChatListKakaoDateTime(input.timeIso, tr, now);
  const parts = missed
    ? [tr(video ? "cm_call_row_missed_video" : "cm_call_row_missed_voice"), time]
    : [
        tr(video ? "cm_call_row_kind_video" : "cm_call_row_kind_voice"),
        input.durationLabel?.trim() || tr(input.badgeLabelKey),
        time,
      ];
  return { text: parts.filter((p) => p.trim()).join(SEPARATOR), missed };
}
