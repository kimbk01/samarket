/**
 * D4 매시 이상 감시 실행부. 호출: `/api/cron/hourly-anomaly-watch` (매시 7분, 직전 완결 1시간).
 * 설계: docs/audit/supabase-request-surge-2026-11-18/structural-analysis-and-design-2026-11-26.md §5 D4
 *
 * 1) 실시간 재시도 폭주 — 앱 감시 집계 `cm_monitoring_rollup_hourly`(category `realtime.subscription`)를 읽는다. 토큰 불필요.
 * 2) 한 방 몰림 — Vercel 관측 `request_path` 별 요청 수. `VERCEL_OBSERVABILITY_TOKEN` 이 없으면 건너뛰고 결과에 `hotResourceCheck: "no_token"`.
 * 이상이 있을 때만 관리자 알림(대상별 하루 1건). Supabase 호출: 읽기 1번 + 이상 시 알림 쓰기.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminNotification } from "@/lib/admin/notifications/admin-notification-service";
import { translateBy } from "@/lib/i18n/translate-by";
import {
  HOT_RESOURCE_ROUTES,
  anomalyDedupeKey,
  evaluateHotResources,
  evaluateRealtimeRetryStorms,
  previousHourWindow,
  summarizeAnomaly,
  type HourlyAnomaly,
  type RealtimeSubscriptionRow,
} from "@/lib/perf/hourly-anomaly-watch";
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TEAM_ID,
  queryVercelObservability,
} from "@/lib/perf/request-budget-vercel-usage.server";

export const REALTIME_SUBSCRIPTION_CATEGORY = "realtime.subscription";

export type HotResourceCheck = "ok" | "no_token" | "failed";

export type HourlyAnomalyWatchResult = {
  windowStart: string;
  windowEnd: string;
  anomalies: HourlyAnomaly[];
  hotResourceCheck: HotResourceCheck;
  notified: number;
};

async function readRealtimeSubscriptionRows(sb: SupabaseClient, startIso: string): Promise<RealtimeSubscriptionRow[]> {
  const { data, error } = await sb
    .from("cm_monitoring_rollup_hourly")
    .select("platform, metric, event_count")
    .eq("category", REALTIME_SUBSCRIPTION_CATEGORY)
    .eq("bucket_hour", startIso)
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as RealtimeSubscriptionRow[];
}

function rowPath(row: Record<string, unknown>): string | null {
  const v = row.request_path ?? row.requestPath;
  return typeof v === "string" ? v : null;
}

function rowRequests(row: Record<string, unknown>): number {
  for (const [k, v] of Object.entries(row)) {
    if (/count_?sum$/i.test(k) && typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

export async function loadHotResourceRows(
  window: { start: number; end: number },
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<{ check: HotResourceCheck; rows: Array<{ path: string; requests: number }> }> {
  const env = opts.env ?? process.env;
  const token = env.VERCEL_OBSERVABILITY_TOKEN?.trim();
  if (!token) return { check: "no_token", rows: [] };
  const teamId = env.VERCEL_OBSERVABILITY_TEAM_ID?.trim() || DEFAULT_TEAM_ID;
  const projectId = env.VERCEL_OBSERVABILITY_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
  try {
    const raw = await queryVercelObservability(
      token,
      teamId,
      projectId,
      {
        metric: "vercel.request.count",
        startTime: new Date(window.start).toISOString(),
        endTime: new Date(window.end).toISOString(),
        granularity: { hours: 1 },
        filter: HOT_RESOURCE_ROUTES.map((r) => `route eq '${r}'`).join(" or "),
        groupBy: ["request_path"],
        limit: 20,
      },
      opts.fetchImpl ?? fetch,
    );
    const byPath = new Map<string, number>();
    for (const r of raw) {
      const p = rowPath(r);
      if (!p) continue;
      byPath.set(p, (byPath.get(p) ?? 0) + rowRequests(r));
    }
    return { check: "ok", rows: [...byPath].map(([path, requests]) => ({ path, requests })) };
  } catch (e) {
    console.error("[hourly-anomaly-watch] vercel_failed", e instanceof Error ? e.message : e);
    return { check: "failed", rows: [] };
  }
}

export async function runHourlyAnomalyWatch(
  sb: SupabaseClient,
  nowMs: number = Date.now(),
  deps: {
    loadHot?: typeof loadHotResourceRows;
    notify?: typeof createAdminNotification;
  } = {},
): Promise<HourlyAnomalyWatchResult> {
  const window = previousHourWindow(nowMs);
  const startIso = new Date(window.start).toISOString();
  const [rtRows, hot] = await Promise.all([
    readRealtimeSubscriptionRows(sb, startIso),
    (deps.loadHot ?? loadHotResourceRows)(window),
  ]);
  const anomalies: HourlyAnomaly[] = [...evaluateRealtimeRetryStorms(rtRows), ...evaluateHotResources(hot.rows)];
  const result: HourlyAnomalyWatchResult = {
    windowStart: startIso,
    windowEnd: new Date(window.end).toISOString(),
    anomalies,
    hotResourceCheck: hot.check,
    notified: 0,
  };
  console.info("[hourly-anomaly-watch] judged", {
    window: `${result.windowStart}~${result.windowEnd}`,
    anomalies: anomalies.map(summarizeAnomaly),
    hotResourceCheck: hot.check,
  });
  const notify = deps.notify ?? createAdminNotification;
  for (const a of anomalies.slice(0, 6)) {
    const body =
      a.kind === "realtime_retry_storm"
        ? translateBy("ko", "admin_hourly_anomaly_rt_body", {
            platform: a.platform,
            retries: a.retries,
            subscribed: a.subscribed,
            window: result.windowStart,
          })
        : translateBy("ko", "admin_hourly_anomaly_hot_body", {
            path: a.path,
            requests: a.requests,
            window: result.windowStart,
          });
    const r = await notify(sb, {
      broadcastPermission: null,
      requiredPermission: null,
      kind: "request_budget_alert",
      severity: "warning",
      title: translateBy("ko", a.kind === "realtime_retry_storm" ? "admin_hourly_anomaly_rt_title" : "admin_hourly_anomaly_hot_title"),
      body,
      dedupeKey: anomalyDedupeKey(a, nowMs),
      push: true,
    });
    if (r.ok) result.notified += 1;
    else console.error("[hourly-anomaly-watch] notify_failed", r.error);
  }
  return result;
}
