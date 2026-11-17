import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";

/** Heartbeat가 이 안이면 “즉시 응답 가능” 신호로 ONLINE 후보 */
export const SAMARKET_PRESENCE_PING_ONLINE_MAX_MS = 15_000;
/** 이를 넘기면 연결/세션 종료로 간주하고 OFFLINE */
export const SAMARKET_PRESENCE_PING_OFFLINE_MS = 90_000;

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

  /**
   * P3(Owner 2026-11-18 레거시 Telegram 기준 안 B): 「자리 비움」 없음 — 앞화면 + 최근 하트비트 = 온라인,
   * 백그라운드·하트비트 끊김 = 오프라인(마지막 접속). 무입력 시간(last_activity_at)은 판정에 쓰지 않는다
   * (활동 기록 자체는 서버·관리자 지표용으로 유지). `lastActivityAtIso` 입력은 호환용으로만 남김.
   */
  const vis = typeof row.appVisibility === "string" ? row.appVisibility.trim().toLowerCase() : "";
  if (vis === "background") return "offline";
  if (pingAge > SAMARKET_PRESENCE_PING_ONLINE_MAX_MS) return "offline";
  return "online";
}

export type LivePresenceSignals = {
  nowMs: number;
  channelSubscribed: boolean;
  documentVisible: boolean;
  lastActivityMs: number;
};

/**
 * 클라이언트 로컬 판정 — 채팅방 입장과 무관. Realtime 구독 + 화면 보임 = ONLINE, 그 외 OFFLINE.
 * P3(레거시 기준): 무입력 시간으로 「자리 비움」을 만들지 않는다. `lastActivityMs` 는 track 페이로드 기록용으로만 남음.
 */
export function deriveLivePresenceFromSignals(s: LivePresenceSignals): CommunityMessengerPresenceState {
  if (!s.channelSubscribed) return "offline";
  if (!s.documentVisible) return "offline";
  return "online";
}

/** 구 클라이언트(배포 전 웹)가 보내는 `away` 를 표시·집계에서 오프라인으로 본다 — 「자리 비움」 표시 없음 */
export function normalizeLegacyPresenceState(
  state: CommunityMessengerPresenceState | null | undefined
): CommunityMessengerPresenceState | null {
  if (!state) return null;
  return state === "away" ? "offline" : state;
}
