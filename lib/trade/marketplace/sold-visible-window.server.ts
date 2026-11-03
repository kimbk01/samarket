/**
 * 판매완료 글 목록 노출 기간 (Owner 2026-11-03 「판매 완료 부분은 1달 보여야 … 어드민에서 기간을 조정」).
 *
 * - 기간 = 어드민 › 거래 › 설정 「판매완료 목록 노출 기간(일)」(`admin_settings.trade_detail_ops.completedVisibleDays`, 기본 30).
 * - 기준 시각 = `posts.sold_at`(판매완료가 된 순간 · DB 트리거). 칸이 아직 없으면(마이그레이션 전) 예전처럼 기간 제한 없이 둔다.
 * - 거래 목록·찾기 = DB 함수 `trade_list_page` 의 `sold_days` · 카테고리 목록(구간 조회) = 같은 기준의 조건 1개.
 * - 내 매물·찜·최근 본 글은 이 기간과 무관(내 기록).
 * 서버 전용 (서비스 키).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  TRADE_SETTINGS_KEY,
  TRADE_SOLD_VISIBLE_DAYS_DEFAULT,
  mergeTradeDetailOpsSettings,
} from "@/services/trade/trade-settings.service";

const SETTINGS_TTL_MS = 30_000;
const COLUMN_PROBE_TTL_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

let daysCache: { value: number; expiresAt: number } | null = null;
let columnCache: { ready: boolean; expiresAt: number } | null = null;

export type TradeSoldVisibleWindow = {
  days: number;
  /** 이 시각 이후 판매완료된 글만 목록에 */
  sinceIso: string;
  /** `posts.sold_at` 칸이 있어 구간 조회에도 조건을 걸 수 있는지 */
  soldAtReady: boolean;
};

export function tradeSoldVisibleSinceIso(days: number, nowMs: number = Date.now()): string {
  return new Date(nowMs - Math.max(1, Math.floor(days)) * DAY_MS).toISOString();
}

/** 구간 조회용 PostgREST 조건 — 판매완료가 아니거나, 기간 안에 판매완료된 글 */
export function tradeSoldVisibleOrFilter(sinceIso: string): string {
  return `status.is.null,status.neq.sold,sold_at.gte.${sinceIso}`;
}

async function loadDays(sb: SupabaseClient): Promise<number> {
  if (daysCache && daysCache.expiresAt > Date.now()) return daysCache.value;
  let value = TRADE_SOLD_VISIBLE_DAYS_DEFAULT;
  try {
    const { data } = await sb.from("admin_settings").select("value_json").eq("key", TRADE_SETTINGS_KEY).maybeSingle();
    value = mergeTradeDetailOpsSettings((data as { value_json?: unknown } | null)?.value_json ?? {}).completedVisibleDays;
  } catch {
    /* 설정을 못 읽으면 기본 30일 */
  }
  daysCache = { value, expiresAt: Date.now() + SETTINGS_TTL_MS };
  return value;
}

async function probeSoldAtColumn(sb: SupabaseClient): Promise<boolean> {
  if (columnCache && columnCache.expiresAt > Date.now()) return columnCache.ready;
  let ready = false;
  try {
    const { error } = await sb.from("posts").select("sold_at").limit(1);
    ready = !error;
  } catch {
    ready = false;
  }
  columnCache = { ready, expiresAt: Date.now() + COLUMN_PROBE_TTL_MS };
  return ready;
}

export async function resolveTradeSoldVisibleWindow(): Promise<TradeSoldVisibleWindow> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    const days = TRADE_SOLD_VISIBLE_DAYS_DEFAULT;
    return { days, sinceIso: tradeSoldVisibleSinceIso(days), soldAtReady: false };
  }
  const [days, soldAtReady] = await Promise.all([loadDays(sb), probeSoldAtColumn(sb)]);
  return { days, sinceIso: tradeSoldVisibleSinceIso(days), soldAtReady };
}

/** 어드민이 기간을 저장하면 바로 다음 요청부터 새 값 */
export function invalidateTradeSoldVisibleWindowCache(): void {
  daysCache = null;
}

/** 테스트 전용 */
export function resetTradeSoldVisibleWindowCacheForTests(): void {
  daysCache = null;
  columnCache = null;
}
