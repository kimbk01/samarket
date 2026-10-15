import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveAuthoritativeCallDurationSeconds } from "@/lib/community-messenger/call-authority/call-duration-authority";
import { formatCallHistoryDurationSeconds } from "@/lib/community-messenger/call-history/call-duration";
import { formatMessengerClockTime } from "@/lib/community-messenger/messenger-clock-time";
import { computeCallLogDisplayType } from "@/lib/community-messenger/call-history/call-log-display-type";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallLog,
  CommunityMessengerCallLogDisplayType,
  CommunityMessengerCallStatus,
  CommunityMessengerProfileLite,
} from "@/lib/community-messenger/types";

/** 서버 `listCommunityMessengerCallLogs` 와 동일 SSOT — `call-history/call-log-display-type` */
export { computeCallLogDisplayType };

function resolveNormalizedCallLogDisplayType(
  entry: CommunityMessengerCallLog
): CommunityMessengerCallLogDisplayType {
  /** status 가 있으면 항상 SSOT 재계산 — 구 캐시 페이로드의 viewer 비인지 displayType 교정 */
  if (entry.status) return computeCallLogDisplayType(entry.status, entry.endedReason, entry.isOutgoing);
  return entry.displayType ?? (entry.isOutgoing ? "outgoing" : "incoming");
}

export function resolveCallLogStatusMessageKey(
  callKind: CommunityMessengerCallKind,
  displayType: CommunityMessengerCallLogDisplayType
): MessageKey {
  return `cm_ui_call_log_${callKind}_${displayType}` as MessageKey;
}

/** viewer 가 놓친 수신 통화만 부재중 (발신자의 미응답 `missed_outgoing` 은 「응답 없음」 — 부재중 아님) */
export function isCallLogMissedDisplayType(displayType: CommunityMessengerCallLogDisplayType): boolean {
  return displayType === "missed_incoming";
}

/** 통화 탭 부제 — 상태는 배지가 담당하므로 통화 종류만 (중복 문구 방지) */
export function resolveCallLogKindMessageKey(callKind: CommunityMessengerCallKind): MessageKey {
  return (callKind === "video" ? "cm_ui_call_log_kind_video" : "cm_ui_call_log_kind_voice") as MessageKey;
}

export function shouldShowCallLogDuration(
  displayType: CommunityMessengerCallLogDisplayType,
  durationSeconds: number,
  status?: CommunityMessengerCallStatus
): boolean {
  if (durationSeconds <= 0) return false;
  if (displayType === "incoming" || displayType === "outgoing") return true;
  if (status === "ended") return true;
  return false;
}

/** DB duration 이 Authority. 연결 전 종료는 0 — startedAt(링) fallback 금지 */
export function resolveCallLogDurationSeconds(call: CommunityMessengerCallLog): number {
  return resolveAuthoritativeCallDurationSeconds({
    clientDurationSeconds: call.durationSeconds,
    answeredAt: null,
    endedAt: call.endedAt,
  });
}

export type CallHistorySubtitleModel = {
  messageKey: MessageKey;
  durationLabel: string | null;
};

/** 카카오톡형 통화목록 부제 — 통화 종류(`cm_ui_call_log_kind_*`) + 연결 통화 시 통화시간. 상태는 배지 SSOT */
export function buildCallHistorySubtitle(call: CommunityMessengerCallLog): CallHistorySubtitleModel {
  const displayType = resolveNormalizedCallLogDisplayType(call);
  const durationSeconds = resolveCallLogDurationSeconds(call);
  return {
    messageKey: resolveCallLogKindMessageKey(call.callKind),
    durationLabel: shouldShowCallLogDuration(displayType, durationSeconds, call.status)
      ? formatCallHistoryDurationSeconds(durationSeconds)
      : null,
  };
}

export function resolveCallLogListTimestampIso(call: CommunityMessengerCallLog): string {
  return call.endedAt?.trim() || call.startedAt?.trim() || "";
}

/** 구 bootstrap·API 페이로드에 `peerAvatarUrl` 이 없을 때 UI·타입 안전 */
export function normalizeCommunityMessengerCallLog(
  entry: CommunityMessengerCallLog
): CommunityMessengerCallLog {
  const displayType = resolveNormalizedCallLogDisplayType(entry);
  return {
    ...entry,
    displayType,
    peerAvatarUrl: entry.peerAvatarUrl ?? null,
    peerPublicId: entry.peerPublicId?.trim().replace(/^@+/, "") || null,
  };
}

export function normalizeCommunityMessengerCallLogs(
  entries: CommunityMessengerCallLog[]
): CommunityMessengerCallLog[] {
  return entries.map(normalizeCommunityMessengerCallLog);
}

/** bootstrap·친구 목록으로 `peerPublicId`·`peerAvatarUrl` 보강 */
export function enrichCommunityMessengerCallLogsWithProfiles(
  entries: CommunityMessengerCallLog[],
  profiles: CommunityMessengerProfileLite[]
): CommunityMessengerCallLog[] {
  if (!profiles.length) return entries;
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return entries.map((entry) => {
    const peerUserId = entry.peerUserId?.trim();
    if (!peerUserId) return entry;
    const peer = byId.get(peerUserId);
    if (!peer) return entry;
    const publicId = entry.peerPublicId?.trim() || peer.subtitle?.trim().replace(/^@+/, "") || null;
    const peerAvatarUrl = entry.peerAvatarUrl?.trim() || peer.avatarUrl?.trim() || null;
    if (publicId === entry.peerPublicId && peerAvatarUrl === entry.peerAvatarUrl) return entry;
    return {
      ...entry,
      ...(publicId ? { peerPublicId: publicId } : {}),
      ...(peerAvatarUrl ? { peerAvatarUrl } : {}),
    };
  });
}

/** 카카오톡 통화목록형 — 오늘·어제·이전 모두 시·분(AM/PM SSOT) 표시 */
export function formatCallLogListTime(
  iso: string,
  lang: AppLanguageCode,
  yesterdayLabel: string
): string {
  const timePart = formatMessengerClockTime(iso);
  if (!timePart) return "";
  const date = new Date(iso.trim());

  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (sameDay) {
    return timePart;
  }
  if (isYesterday) {
    return `${yesterdayLabel} ${timePart}`;
  }
  const datePart = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
  }).format(date);
  return `${datePart} ${timePart}`;
}

/** 상대 통화 상세 이력 행 — 시각만 (AM/PM SSOT) */
export function formatCallPeerDetailRowTime(iso: string, _lang: AppLanguageCode): string {
  return formatMessengerClockTime(iso);
}
