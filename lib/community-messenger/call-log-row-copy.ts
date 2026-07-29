import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { resolveAuthoritativeCallDurationSeconds } from "@/lib/community-messenger/call-authority/call-duration-authority";
import { formatCallHistoryDurationSeconds } from "@/lib/community-messenger/call-history/call-duration";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallLog,
  CommunityMessengerCallLogDisplayType,
  CommunityMessengerCallStatus,
  CommunityMessengerProfileLite,
} from "@/lib/community-messenger/types";

/** 클라이언트·레거시 페이로드용 — 서버 `computeCommunityMessengerCallLogDisplayType` 과 동일 */
export function computeCallLogDisplayType(
  status: CommunityMessengerCallStatus,
  endedReason: string | null | undefined,
  isOutgoing: boolean
): CommunityMessengerCallLogDisplayType {
  const er = endedReason?.trim() || null;
  if (status === "missed") return isOutgoing ? "missed_outgoing" : "missed_incoming";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "dialing") return "outgoing";
  if (status === "incoming") return "incoming";
  if (status === "ended") {
    if (er && er.startsWith("failed_")) return "failed";
    return isOutgoing ? "outgoing" : "incoming";
  }
  return isOutgoing ? "outgoing" : "incoming";
}

function resolveNormalizedCallLogDisplayType(
  entry: CommunityMessengerCallLog
): CommunityMessengerCallLogDisplayType {
  if (entry.displayType) return entry.displayType;
  return computeCallLogDisplayType(entry.status, entry.endedReason, entry.isOutgoing);
}

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

/** 카카오톡형 통화목록 부제 — `cm_ui_call_log_*` 단일 key + 연결 통화 시 통화시간 */
export function buildCallHistorySubtitle(call: CommunityMessengerCallLog): CallHistorySubtitleModel {
  const displayType = resolveNormalizedCallLogDisplayType(call);
  const durationSeconds = resolveCallLogDurationSeconds(call);
  return {
    messageKey: resolveCallLogStatusMessageKey(call.callKind, displayType),
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

/** 카카오톡 통화목록형 — 오늘·어제·이전 모두 시·분 표시 */
export function formatCallLogListTime(
  iso: string,
  lang: AppLanguageCode,
  yesterdayLabel: string
): string {
  const raw = iso.trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";

  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: lang === "ko",
  }).format(date);

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

/** 상대 통화 상세 이력 행 — 구간 헤더 아래 시각만(오후 7:05) */
export function formatCallPeerDetailRowTime(iso: string, lang: AppLanguageCode): string {
  const raw = iso.trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: lang === "ko",
  }).format(date);
}
