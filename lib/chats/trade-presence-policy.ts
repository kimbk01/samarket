/** 거래 1:1 채팅 presence 정책 (활동·연결 기준, 페이지 한정 아님) */

import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import type { MessageKey } from "@/lib/i18n/messages";

export const TRADE_PRESENCE_HEARTBEAT_INTERVAL_MS = 15_000;
export const TRADE_PRESENCE_ONLINE_MAX_IDLE_MS = 30_000;
export const TRADE_PRESENCE_AWAY_MAX_IDLE_MS = 5 * 60_000;
export const TRADE_TYPING_TTL_MS = 3_000;

export type TradePresenceLiveState = "online" | "away" | "offline";

export type TradePresenceAudience = "everyone" | "friends" | "nobody";

export function computeTradePresenceLiveState(input: {
  wsLive: boolean;
  /** document.visibilityState === 'visible' */
  tabVisible: boolean;
  /** 마지막 입력/클릭/스크롤 등 (멀티탭이면 탭 간 최댓값) */
  lastActivityAtMs: number;
  nowMs?: number;
}): TradePresenceLiveState {
  const now = input.nowMs ?? Date.now();
  if (!input.wsLive) return "offline";
  const idle = now - input.lastActivityAtMs;
  if (idle >= TRADE_PRESENCE_AWAY_MAX_IDLE_MS) return "offline";
  if (!input.tabVisible) return "away";
  if (idle < TRADE_PRESENCE_ONLINE_MAX_IDLE_MS) return "online";
  return "away";
}

export function tradePresenceStateMessageKey(state: TradePresenceLiveState): MessageKey {
  if (state === "online") return "chats_presence_online";
  if (state === "away") return "chats_presence_away";
  return "chats_presence_offline";
}

export type TradePresenceTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function tradePresenceStateLabel(
  state: TradePresenceLiveState,
  t: TradePresenceTranslate
): string {
  return t(tradePresenceStateMessageKey(state));
}

/** @deprecated 서버·클라는 `formatTradeLastSeenLabel` 사용 */
export function formatTradeLastSeenKo(iso: string | null | undefined, nowMs: number = Date.now()): string {
  return formatTradeLastSeenLabel("ko", iso, nowMs);
}

export function formatTradeLastSeenLabel(
  lang: AppLanguageCode,
  iso: string | null | undefined,
  nowMs: number = Date.now()
): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, nowMs - t);
  if (diff < 60_000) return translate(lang, "chats_presence_last_seen_just_now");
  if (diff < 60 * 60_000) {
    return translate(lang, "chats_presence_last_seen_minutes", {
      minutes: Math.floor(diff / 60_000),
    });
  }
  const d = new Date(t);
  const today = new Date(nowMs);
  const sameDay =
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  if (sameDay) {
    return translate(lang, "chats_presence_last_seen_today", {
      time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    });
  }
  const yday = new Date(nowMs - 86400000);
  const ySame =
    d.getFullYear() === yday.getFullYear() && d.getMonth() === yday.getMonth() && d.getDate() === yday.getDate();
  if (ySame) return translate(lang, "chats_presence_last_seen_yesterday");
  return translate(lang, "chats_presence_last_seen_date", {
    month: d.getMonth() + 1,
    day: d.getDate(),
  });
}
