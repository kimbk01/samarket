import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** U1 관리자 화면 — 최근 24시간 DB 집계 (category·metric·outcome·platform 별 합계) */
export type MessengerMonitoringDurableRow = {
  category: string;
  metric: string;
  outcome: string;
  platform: string;
  eventCount: number;
  valueCount: number;
  valueAvg: number | null;
  valueMax: number | null;
  droppedCount: number;
};

export type MessengerMonitoringDurableRollup =
  | { ok: true; windowHours: number; rows: MessengerMonitoringDurableRow[] }
  | { ok: false; error: string };

const WINDOW_HOURS = 24;
/** 하루 최대 행(허용 종류 × 플랫폼 × 24시간)보다 넉넉한 상한 */
const MAX_SOURCE_ROWS = 10_000;

type SourceRow = {
  category: string;
  metric: string;
  outcome: string;
  platform: string;
  event_count: number | string;
  value_count: number | string;
  value_sum: number | string;
  value_max: number | string | null;
  dropped_count: number | string;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export async function loadMessengerMonitoringDurableRollup(
  sb: SupabaseClient | null,
): Promise<MessengerMonitoringDurableRollup> {
  if (!sb) return { ok: false, error: "service_unavailable" };
  const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
  const { data, error } = await sb
    .from("cm_monitoring_rollup_hourly")
    .select("category, metric, outcome, platform, event_count, value_count, value_sum, value_max, dropped_count")
    .gte("bucket_hour", since)
    .limit(MAX_SOURCE_ROWS);
  if (error) return { ok: false, error: error.code || "query_failed" };

  const merged = new Map<string, MessengerMonitoringDurableRow & { valueSum: number }>();
  for (const r of (data ?? []) as SourceRow[]) {
    const key = `${r.category}\u0000${r.metric}\u0000${r.outcome}\u0000${r.platform}`;
    const cur =
      merged.get(key) ??
      {
        category: r.category,
        metric: r.metric,
        outcome: r.outcome,
        platform: r.platform,
        eventCount: 0,
        valueCount: 0,
        valueSum: 0,
        valueAvg: null,
        valueMax: null,
        droppedCount: 0,
      };
    cur.eventCount += num(r.event_count);
    cur.valueCount += num(r.value_count);
    cur.valueSum += num(r.value_sum);
    cur.droppedCount += num(r.dropped_count);
    if (r.value_max != null) {
      const m = num(r.value_max);
      cur.valueMax = cur.valueMax == null ? m : Math.max(cur.valueMax, m);
    }
    merged.set(key, cur);
  }

  const rows = [...merged.values()]
    .map(({ valueSum, ...row }) => ({ ...row, valueAvg: row.valueCount > 0 ? valueSum / row.valueCount : null }))
    .sort((a, b) => b.eventCount + b.droppedCount - (a.eventCount + a.droppedCount));
  return { ok: true, windowHours: WINDOW_HOURS, rows };
}
