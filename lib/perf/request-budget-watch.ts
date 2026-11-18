/**
 * K5 — 요청 예산 운영 감시 판정 (순수 함수). 실행은 `/api/cron/request-budget-watch` (하루 1회 09:00 PHT).
 * 입력: `cm_monitoring_rollup_hourly` 의 `server.supabase_route` 행(계수기 집계). 출력: 경보 목록 — 비어 있으면 알림 없음.
 */
import {
  DAILY_TOTAL_ALERT_FACTOR,
  ROUTE_BUDGET_ALERT_FACTOR,
  ROUTE_BUDGET_MIN_REQUESTS,
  ROUTE_SUPABASE_CALL_BUDGET,
  UNBUDGETED_ROUTE_DAILY_CALL_ALERT,
} from "@/lib/perf/request-budget";
import { routeToRollupMetric } from "@/lib/perf/supabase-call-counter";

export type RouteUsage = { metric: string; calls: number; requests: number };

export type RequestBudgetBreach =
  | { kind: "route_over_budget"; route: string; perRequest: number; budget: number; calls: number; requests: number }
  | { kind: "unbudgeted_route"; metric: string; calls: number; requests: number }
  | { kind: "daily_total"; total: number; baselineMedian: number; factor: number }
  | { kind: "counter_silent" };

export type RequestBudgetWatchInput = {
  /** 최근 24시간 라우트별 합계 (실사용 category 만) */
  last24h: RouteUsage[];
  /** 그 전 날들의 하루 합계 (최근 → 과거). 0건인 날은 계수기 설치 전으로 보고 제외 */
  previousDailyTotals: number[];
  /** 최근 24시간 시험 기기 호출 합계 (참고 표시용) */
  testCalls24h: number;
};

export type RequestBudgetWatchResult = {
  breaches: RequestBudgetBreach[];
  total24h: number;
  testCalls24h: number;
  baselineMedian: number | null;
};

function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

const METRIC_TO_ROUTE: ReadonlyMap<string, string> = new Map(
  Object.keys(ROUTE_SUPABASE_CALL_BUDGET).map((route) => [routeToRollupMetric(route), route]),
);

export function evaluateRequestBudget(input: RequestBudgetWatchInput): RequestBudgetWatchResult {
  const breaches: RequestBudgetBreach[] = [];
  let total = 0;
  for (const u of input.last24h) {
    total += u.calls;
    const route = METRIC_TO_ROUTE.get(u.metric);
    if (route) {
      const budget = ROUTE_SUPABASE_CALL_BUDGET[route]!;
      if (u.requests >= ROUTE_BUDGET_MIN_REQUESTS) {
        const perRequest = u.calls / u.requests;
        if (perRequest > budget * ROUTE_BUDGET_ALERT_FACTOR) {
          breaches.push({
            kind: "route_over_budget",
            route,
            perRequest: Math.round(perRequest * 10) / 10,
            budget,
            calls: u.calls,
            requests: u.requests,
          });
        }
      }
      continue;
    }
    /** 미들웨어·저장소 밖 호출은 라우트 판정 제외(총량으로만 본다) */
    if (u.metric === "unknown") continue;
    if (u.calls >= UNBUDGETED_ROUTE_DAILY_CALL_ALERT) {
      breaches.push({ kind: "unbudgeted_route", metric: u.metric, calls: u.calls, requests: u.requests });
    }
  }
  if (total === 0) breaches.push({ kind: "counter_silent" });
  const baselineMedian = median(input.previousDailyTotals);
  if (baselineMedian != null && total > baselineMedian * DAILY_TOTAL_ALERT_FACTOR) {
    breaches.push({ kind: "daily_total", total, baselineMedian, factor: Math.round((total / baselineMedian) * 10) / 10 });
  }
  return { breaches, total24h: total, testCalls24h: input.testCalls24h, baselineMedian };
}

/** 알림 본문 한 줄씩 (관리자 운영 언어 = 한국어 문구는 카탈로그 키로 만들고, 여기서는 숫자 요약만) */
export function summarizeBreach(b: RequestBudgetBreach): string {
  switch (b.kind) {
    case "route_over_budget":
      return `${b.route} ${b.perRequest}/${b.budget} (${b.calls}/${b.requests})`;
    case "unbudgeted_route":
      return `${b.metric} ${b.calls} (${b.requests})`;
    case "daily_total":
      return `total ${b.total} / median ${Math.round(b.baselineMedian)} (x${b.factor})`;
    case "counter_silent":
      return "counter 0";
  }
}
