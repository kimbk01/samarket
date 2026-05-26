/**
 * useMessengerRoomClientPhase1 첫 render 구간 분해 — UI·read/unread·API shape 변경 없음.
 */
import { readTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";
import {
  isTradeC2CPerfEnabled,
  recordTradeC2CMetricMs,
  type TradeC2CPerfMetricKey,
} from "@/lib/trade/trade-c2c-perf-metrics";

export type TradePhase1BreakdownSection =
  | "bootstrap_normalize"
  | "messages_normalize"
  | "participants_normalize"
  | "store_hydration"
  | "read_state_init"
  | "unread_state_init"
  | "realtime_prepare"
  | "presence_prepare"
  | "memo_compute"
  | "blocking_task";

let tracking = false;
let tHook0 = 0;
let tCursor = 0;
let finalized = false;
let memoAccumMs = 0;
let blockingTaskMs = 0;
let largeArrayCount = 0;
let initialMessageCount = 0;

const sectionMs: Partial<Record<TradePhase1BreakdownSection, number>> = {};

function enabled(): boolean {
  return isTradeC2CPerfEnabled() && Boolean(readTradeChatEntryMark());
}

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function record(key: TradeC2CPerfMetricKey, ms: number): void {
  recordTradeC2CMetricMs(key, Math.max(0, Math.round(ms)));
}

export function beginTradePhase1Breakdown(): boolean {
  if (!enabled() || finalized) return false;
  if (tracking) return true;
  tracking = true;
  tHook0 = perfNow();
  tCursor = tHook0;
  memoAccumMs = 0;
  blockingTaskMs = 0;
  largeArrayCount = 0;
  initialMessageCount = 0;
  for (const k of Object.keys(sectionMs) as TradePhase1BreakdownSection[]) {
    delete sectionMs[k];
  }
  return true;
}

export function endTradePhase1BreakdownSection(section: TradePhase1BreakdownSection): void {
  if (!tracking) return;
  const now = perfNow();
  const delta = Math.max(0, Math.round(now - tCursor));
  sectionMs[section] = (sectionMs[section] ?? 0) + delta;
  tCursor = now;
}

export function noteTradePhase1MemoWorkMs(ms: number): void {
  if (!tracking || ms <= 0) return;
  memoAccumMs += ms;
}

export function noteTradePhase1BlockingTaskMs(ms: number): void {
  if (!tracking || ms < 50) return;
  blockingTaskMs += ms;
}

export function noteTradePhase1LargeArrayCount(count: number): void {
  if (!tracking || count <= 0) return;
  largeArrayCount = Math.max(largeArrayCount, count);
}

export function noteTradePhase1InitialMessageCount(count: number): void {
  if (!tracking || count < 0) return;
  initialMessageCount = Math.max(initialMessageCount, count);
}

/** trade 진입 첫 render — shell 전 useMemo·정렬·collapse 생략(의미 동치·Pass2 defer와 정합) */
export function isTradePhase1EntryLightPass(): boolean {
  return tracking && !finalized;
}

export function finalizeTradePhase1Breakdown(): void {
  if (!tracking || finalized) return;
  finalized = true;
  tracking = false;
  const total = Math.max(0, Math.round(perfNow() - tHook0));
  sectionMs.memo_compute = (sectionMs.memo_compute ?? 0) + Math.round(memoAccumMs);

  record("phase1_total_ms", total);
  record("phase1_bootstrap_normalize_ms", sectionMs.bootstrap_normalize ?? 0);
  record("phase1_messages_normalize_ms", sectionMs.messages_normalize ?? 0);
  record("phase1_participants_normalize_ms", sectionMs.participants_normalize ?? 0);
  record("phase1_store_hydration_ms", sectionMs.store_hydration ?? 0);
  record("phase1_read_state_init_ms", sectionMs.read_state_init ?? 0);
  record("phase1_unread_state_init_ms", sectionMs.unread_state_init ?? 0);
  record("phase1_realtime_prepare_ms", sectionMs.realtime_prepare ?? 0);
  record("phase1_presence_prepare_ms", sectionMs.presence_prepare ?? 0);
  record("phase1_memo_compute_ms", sectionMs.memo_compute ?? 0);
  if (largeArrayCount > 0) record("phase1_large_array_count", largeArrayCount);
  if (initialMessageCount > 0) record("phase1_initial_message_count", initialMessageCount);
  if (blockingTaskMs > 0) record("phase1_blocking_task_ms", Math.round(blockingTaskMs));
}

export function resetTradePhase1BreakdownForTests(): void {
  tracking = false;
  finalized = false;
  tHook0 = 0;
  tCursor = 0;
  memoAccumMs = 0;
  blockingTaskMs = 0;
  largeArrayCount = 0;
  initialMessageCount = 0;
  for (const k of Object.keys(sectionMs) as TradePhase1BreakdownSection[]) {
    delete sectionMs[k];
  }
}
