import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";

/** Heartbeat가 이 안이면 “즉시 응답 가능” 신호로 ONLINE 후보 */
export const SAMARKET_PRESENCE_PING_ONLINE_MAX_MS = 15_000;
/** 이를 넘기면 연결/세션 종료로 간주하고 OFFLINE */
export const SAMARKET_PRESENCE_PING_OFFLINE_MS = 90_000;
/** 이를 넘기면 사용자 입력이 없다고 보고 ONLINE 불가 → AWAY */
export const SAMARKET_PRESENCE_ACTIVITY_ONLINE_MAX_MS = 2 * 60_000;

export type SamarketAppVisibility = "foreground" | "background" | "unknown";

function presenceStateRank(s: CommunityMessengerPresenceState): number {
  return s === "online" ? 3 : s === "away" ? 2 : 1;
}

export function mergePresenceStates(
  a: CommunityMessengerPresenceState,
  b: CommunityMessengerPresenceState
): CommunityMessengerPresenceState {
  return presenceStateRank(a) >= presenceStateRank(b) ? a : b;
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export type DbPresenceRowInput = {
  nowMs: number;
  lastPingAtIso: string | null | undefined;
  lastActivityAtIso: string | null | undefined;
  lastSeenAtIso: string | null | undefined;
  updatedAtIso: string | null | undefined;
  appVisibility: SamarketAppVisibility | string | null | undefined;
};

/**
 * DB 스냅샷만으로 presence 파생 (부트스트랩·HTTP 폴백).
 * `last_ping_at` 이 비어 있으면 `updated_at` → `last_seen_at` 순으로 대체.
 */
export function derivePresenceFromDbRow(row: DbPresenceRowInput): CommunityMessengerPresenceState {
  const nowMs = row.nowMs;
  const pingMs =
    parseIsoMs(row.lastPingAtIso) ??
    parseIsoMs(row.updatedAtIso) ??
    parseIsoMs(row.lastSeenAtIso);
  if (pingMs == null) return "offline";
  const pingAge = nowMs - pingMs;
  if (pingAge > SAMARKET_PRESENCE_PING_OFFLINE_MS) return "offline";

  const activityMs =
    parseIsoMs(row.lastActivityAtIso) ?? parseIsoMs(row.updatedAtIso) ?? pingMs;
  const activityAge = nowMs - activityMs;

  const vis = typeof row.appVisibility === "string" ? row.appVisibility.trim().toLowerCase() : "";
  if (vis === "background") return "away";
  if (activityAge > SAMARKET_PRESENCE_ACTIVITY_ONLINE_MAX_MS) return "away";
  if (pingAge > SAMARKET_PRESENCE_PING_ONLINE_MAX_MS) return "away";
  return "online";
}

export type LivePresenceSignals = {
  nowMs: number;
  channelSubscribed: boolean;
  documentVisible: boolean;
  lastActivityMs: number;
};

/**
 * 클라이언트 로컬 판정 — 채팅방 입장과 무관. Realtime 구독이 살아 있을 때만 ONLINE/AWAY.
 */
export function deriveLivePresenceFromSignals(s: LivePresenceSignals): CommunityMessengerPresenceState {
  if (!s.channelSubscribed) return "offline";
  const activityAge = s.nowMs - s.lastActivityMs;
  if (!s.documentVisible) return "away";
  if (activityAge > SAMARKET_PRESENCE_ACTIVITY_ONLINE_MAX_MS) return "away";
  return "online";
}
