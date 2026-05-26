/**
 * 거래 채팅 진입 — 클릭 → compose → resolve → room URL → shell 구간 분해(계측만).
 * `readTradeChatEntryMark().startedAt` 기준. E2E: `SAMARKET_E2E_TRADE_C2C_PHASE_SESSION_KEY` 미러.
 */
import { readTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";
import {
  isTradeC2CPerfEnabled,
  recordTradeC2CMetricMs,
  type TradeC2CPerfMetricKey,
} from "@/lib/trade/trade-c2c-perf-metrics";

const JOURNEY_STORAGE_KEY = "samarket:debug:tradeChatEntryJourney" as const;

export type TradeChatEntryJourneyMilestone =
  | "compose_route_mounted"
  | "resolve_fetch_start"
  | "resolve_fetch_done"
  | "room_prefetch_start"
  | "room_prefetch_done"
  | "router_replace_called"
  | "room_page_mounted"
  | "room_rsc_flight_done"
  | "bootstrap_fetch_start"
  | "bootstrap_fetch_done"
  | "room_shell_ready";

type JourneyStore = Partial<Record<TradeChatEntryJourneyMilestone, number>>;

function readJourney(): JourneyStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(JOURNEY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as JourneyStore;
  } catch {
    return {};
  }
}

function writeJourney(next: JourneyStore): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function resetTradeChatEntryJourney(): void {
  writeJourney({});
}

/** 활성 trade entry mark 가 있을 때만 1회 기록(이후 동일 키 스킵). */
export function noteTradeChatEntryJourneyMilestone(name: TradeChatEntryJourneyMilestone): void {
  if (!isTradeC2CPerfEnabled()) return;
  if (!readTradeChatEntryMark()) return;
  const j = readJourney();
  if (j[name] != null) return;
  writeJourney({ ...j, [name]: Date.now() });
}

function segMs(a: number | undefined, b: number | undefined): number | null {
  if (typeof a !== "number" || typeof b !== "number") return null;
  const d = Math.round(b - a);
  if (d < 0) return 0;
  return d;
}

function recordSeg(key: TradeC2CPerfMetricKey, ms: number | null): void {
  if (ms == null || !Number.isFinite(ms)) return;
  recordTradeC2CMetricMs(key, ms);
}

/** shell visible 또는 room mount 시점에 구간 키 일괄 기록 */
export function flushTradeChatEntryJourneyMetrics(reason: "room_shell_ready" | "room_page_mounted"): void {
  if (!isTradeC2CPerfEnabled()) return;
  const mark = readTradeChatEntryMark();
  if (!mark) return;
  const t0 = mark.startedAt;
  const j = readJourney();
  if (reason === "room_shell_ready") {
    noteTradeChatEntryJourneyMilestone("room_shell_ready");
  }

  const compose = j.compose_route_mounted;
  const fetchStart = j.resolve_fetch_start;
  const fetchDone = j.resolve_fetch_done;
  const prefetchStart = j.room_prefetch_start;
  const prefetchDone = j.room_prefetch_done;
  const replace = j.router_replace_called;
  const roomMount = j.room_page_mounted;
  const rscDone = j.room_rsc_flight_done;
  const bootStart = j.bootstrap_fetch_start;
  const bootDone = j.bootstrap_fetch_done;
  const shell = j.room_shell_ready ?? (reason === "room_shell_ready" ? Date.now() : undefined);

  recordSeg("chat_click_to_compose_route_ms", segMs(t0, compose));
  recordSeg("compose_route_to_resolve_fetch_start_ms", segMs(compose, fetchStart));
  recordSeg("trade_chat_resolve_fetch_ms", segMs(fetchStart, fetchDone));
  recordSeg("resolve_done_to_prefetch_start_ms", segMs(fetchDone, prefetchStart));
  recordSeg("prefetch_done_to_router_replace_ms", segMs(prefetchDone, replace));
  recordSeg("router_replace_to_room_url_ms", segMs(replace, roomMount));
  recordSeg("room_url_to_rsc_ready_ms", segMs(roomMount, rscDone));
  recordSeg("room_rsc_to_bootstrap_fetch_start_ms", segMs(rscDone, bootStart));
  recordSeg("cm_room_bootstrap_total_ms", segMs(bootStart, bootDone));
  recordSeg("room_bootstrap_to_shell_ready_ms", segMs(bootDone, shell));
  recordSeg("chat_click_to_room_ready_ms", segMs(t0, shell));
}
