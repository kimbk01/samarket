/**
 * K5 — 요청 예산 운영 감시 실행부. 호출: `/api/cron/request-budget-watch` (하루 1회 09:00 PHT).
 * 계수기 집계(`cm_monitoring_rollup_hourly`)를 읽어 판정하고, 경보가 있을 때만 관리자 알림 1건(하루 1회 dedupe).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminNotification } from "@/lib/admin/notifications/admin-notification-service";
import { translateBy } from "@/lib/i18n/translate-by";
import { DAILY_TOTAL_BASELINE_DAYS } from "@/lib/perf/request-budget";
import {
  evaluateRequestBudget,
  summarizeBreach,
  type RequestBudgetWatchResult,
  type RouteUsage,
} from "@/lib/perf/request-budget-watch";
import {
  SUPABASE_ROUTE_CATEGORY,
  SUPABASE_ROUTE_TEST_CATEGORY,
  SUPABASE_ROUTE_UNITS_CATEGORY,
} from "@/lib/perf/supabase-call-counter";

const PAGE = 1000;
const MAX_PAGES = 100;
const DAY_MS = 24 * 60 * 60_000;

type RollupRow = { bucket_hour: string; category: string; metric: string; event_count: number; value_count: number };

async function readRollupRows(sb: SupabaseClient, sinceIso: string): Promise<RollupRow[]> {
  const out: RollupRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await sb
      .from("cm_monitoring_rollup_hourly")
      .select("bucket_hour, category, metric, event_count, value_count")
      .in("category", [SUPABASE_ROUTE_CATEGORY, SUPABASE_ROUTE_TEST_CATEGORY, SUPABASE_ROUTE_UNITS_CATEGORY])
      .gte("bucket_hour", sinceIso)
      .order("bucket_hour", { ascending: true })
      .order("metric", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RollupRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export function aggregateRollupForWatch(rows: RollupRow[], nowMs: number) {
  const last24hStart = nowMs - DAY_MS;
  const byMetric = new Map<string, RouteUsage>();
  const dayTotals = new Array<number>(DAILY_TOTAL_BASELINE_DAYS).fill(0);
  let testCalls24h = 0;
  for (const r of rows) {
    const t = Date.parse(r.bucket_hour);
    if (!Number.isFinite(t)) continue;
    const calls = Number(r.event_count) || 0;
    const requests = Number(r.value_count) || 0;
    /** 2026-11-22 단위 행(받는 사람 수)은 호출 수가 아님 — 24시간 라우트에 단위로만 더한다(합계·전일 비교 제외) */
    if (r.category === SUPABASE_ROUTE_UNITS_CATEGORY) {
      if (t >= last24hStart) {
        const u = byMetric.get(r.metric) ?? { metric: r.metric, calls: 0, requests: 0 };
        u.units = (u.units ?? 0) + calls;
        byMetric.set(r.metric, u);
      }
      continue;
    }
    if (t >= last24hStart) {
      if (r.category === SUPABASE_ROUTE_TEST_CATEGORY) {
        testCalls24h += calls;
        continue;
      }
      const u = byMetric.get(r.metric) ?? { metric: r.metric, calls: 0, requests: 0 };
      u.calls += calls;
      u.requests += requests;
      byMetric.set(r.metric, u);
      continue;
    }
    if (r.category !== SUPABASE_ROUTE_CATEGORY) continue;
    const dayIndex = Math.floor((last24hStart - t - 1) / DAY_MS);
    if (dayIndex >= 0 && dayIndex < DAILY_TOTAL_BASELINE_DAYS) dayTotals[dayIndex]! += calls;
  }
  return { last24h: [...byMetric.values()], previousDailyTotals: dayTotals, testCalls24h };
}

export async function runRequestBudgetWatch(
  sb: SupabaseClient,
  nowMs: number = Date.now(),
): Promise<RequestBudgetWatchResult & { notified: boolean }> {
  const since = new Date(nowMs - (DAILY_TOTAL_BASELINE_DAYS + 1) * DAY_MS).toISOString();
  const rows = await readRollupRows(sb, since);
  const result = evaluateRequestBudget(aggregateRollupForWatch(rows, nowMs));
  if (result.breaches.length === 0) return { ...result, notified: false };

  const items = result.breaches.slice(0, 12).map(summarizeBreach).join(" · ");
  console.error("[request-budget-watch] breach", { count: result.breaches.length, total24h: result.total24h, items });
  const day = new Date(nowMs + 8 * 60 * 60_000).toISOString().slice(0, 10);
  const r = await createAdminNotification(sb, {
    broadcastPermission: null,
    requiredPermission: null,
    kind: "request_budget_alert",
    severity: "warning",
    title: translateBy("ko", "admin_request_budget_alert_title", { count: result.breaches.length }),
    body: translateBy("ko", "admin_request_budget_alert_body", {
      total: result.total24h,
      test: result.testCalls24h,
      items,
    }),
    dedupeKey: `request_budget_alert:${day}`,
    push: true,
  });
  if (!r.ok) console.error("[request-budget-watch] notify_failed", r.error);
  return { ...result, notified: r.ok };
}
