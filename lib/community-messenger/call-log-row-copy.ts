import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallLog,
  CommunityMessengerCallLogDisplayType,
} from "@/lib/community-messenger/types";

export function resolveCallLogStatusMessageKey(
  callKind: CommunityMessengerCallKind,
  displayType: CommunityMessengerCallLogDisplayType
): MessageKey {
  return `cm_ui_call_log_${callKind}_${displayType}` as MessageKey;
}

export function isCallLogMissedDisplayType(displayType: CommunityMessengerCallLogDisplayType): boolean {
  return displayType === "missed_incoming" || displayType === "missed_outgoing";
}

export function shouldShowCallLogDuration(
  displayType: CommunityMessengerCallLogDisplayType,
  durationSeconds: number
): boolean {
  return durationSeconds > 0 && (displayType === "incoming" || displayType === "outgoing");
}

export function resolveCallLogListTimestampIso(call: CommunityMessengerCallLog): string {
  return call.endedAt?.trim() || call.startedAt?.trim() || "";
}

/** 구 bootstrap·API 페이로드에 `peerAvatarUrl` 이 없을 때 UI·타입 안전 */
export function normalizeCommunityMessengerCallLog(
  entry: CommunityMessengerCallLog
): CommunityMessengerCallLog {
  return {
    ...entry,
    peerAvatarUrl: entry.peerAvatarUrl ?? null,
  };
}

export function normalizeCommunityMessengerCallLogs(
  entries: CommunityMessengerCallLog[]
): CommunityMessengerCallLog[] {
  return entries.map(normalizeCommunityMessengerCallLog);
}

/** 카카오톡 통화목록형 — 오늘은 시각, 어제는 「어제」, 그 외 월·일 */
export function formatCallLogListTime(
  iso: string,
  lang: AppLanguageCode,
  yesterdayLabel: string
): string {
  const raw = iso.trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (sameDay) {
    return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: lang === "ko",
    }).format(date);
  }
  if (isYesterday) {
    return yesterdayLabel;
  }
  return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
    month: "long",
    day: "numeric",
  }).format(date);
}
