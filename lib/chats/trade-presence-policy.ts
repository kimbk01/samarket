/** 거래 1:1 채팅 presence 정책 (활동·연결 기준, 페이지 한정 아님) */

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

/** 상대 표시용 라벨 (한국어) */
export function tradePresenceStateLabel(state: TradePresenceLiveState): string {
  if (state === "online") return "온라인";
  if (state === "away") return "자리비움";
  return "오프라인";
}

export function formatTradeLastSeenKo(iso: string | null | undefined, nowMs: number = Date.now()): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, nowMs - t);
  if (diff < 60_000) return "방금 전 접속";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}분 전 접속`;
  const d = new Date(t);
  const today = new Date(nowMs);
  const sameDay =
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  if (sameDay) {
    return `오늘 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 접속`;
  }
  const yday = new Date(nowMs - 86400000);
  const ySame =
    d.getFullYear() === yday.getFullYear() && d.getMonth() === yday.getMonth() && d.getDate() === yday.getDate();
  if (ySame) return "어제 접속";
  return `${d.getMonth() + 1}/${d.getDate()} 접속`;
}
