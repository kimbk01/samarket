import { describe, expect, it } from "vitest";
import { evaluateRequestBudget } from "@/lib/perf/request-budget-watch";
import { aggregateRollupForWatch } from "@/lib/perf/request-budget-watch.server";
import { routeToRollupMetric } from "@/lib/perf/supabase-call-counter";

const HOME_FEED = routeToRollupMetric("/api/stores/home-feed"); // 예산 10.5 (2026-11-19 admin_settings 묶음 16.6→14.9, 매장 탐색 단계 묶음 14.9→10.5)

describe("evaluateRequestBudget", () => {
  it("예산 × 1.2 이하면 경보 없음", () => {
    const r = evaluateRequestBudget({
      last24h: [{ metric: HOME_FEED, calls: 1250, requests: 100 }],
      previousDailyTotals: [2000, 2100],
      testCalls24h: 0,
    });
    expect(r.breaches).toEqual([]);
  });
  it("예산 × 1.2 초과 라우트 경보", () => {
    const r = evaluateRequestBudget({
      last24h: [{ metric: HOME_FEED, calls: 2100, requests: 100 }],
      previousDailyTotals: [],
      testCalls24h: 0,
    });
    expect(r.breaches).toEqual([
      { kind: "route_over_budget", route: "/api/stores/home-feed", perRequest: 21, budget: 10.5, calls: 2100, requests: 100 },
    ]);
  });
  it("요청이 적은 라우트는 1회당 판정 제외", () => {
    const r = evaluateRequestBudget({ last24h: [{ metric: HOME_FEED, calls: 500, requests: 5 }], previousDailyTotals: [], testCalls24h: 0 });
    expect(r.breaches).toEqual([]);
  });
  it("예산 없는 라우트가 하루 1,000건 이상이면 경보, unknown(미들웨어)은 제외", () => {
    const r = evaluateRequestBudget({
      last24h: [
        { metric: "api.new-route", calls: 1200, requests: 100 },
        { metric: "unknown", calls: 50_000, requests: 0 },
      ],
      previousDailyTotals: [],
      testCalls24h: 0,
    });
    expect(r.breaches).toEqual([{ kind: "unbudgeted_route", metric: "api.new-route", calls: 1200, requests: 100 }]);
  });
  it("하루 총량이 직전 중앙값 × 1.5 초과면 경보", () => {
    const r = evaluateRequestBudget({
      last24h: [{ metric: "unknown", calls: 16_000, requests: 0 }],
      previousDailyTotals: [10_000, 9_000, 0, 11_000],
      testCalls24h: 0,
    });
    expect(r.baselineMedian).toBe(10_000);
    expect(r.breaches).toEqual([{ kind: "daily_total", total: 16_000, baselineMedian: 10_000, factor: 1.6 }]);
  });
  it("계수기가 0건이면 경보(감시 장치 고장 감지)", () => {
    expect(evaluateRequestBudget({ last24h: [], previousDailyTotals: [], testCalls24h: 0 }).breaches).toEqual([
      { kind: "counter_silent" },
    ]);
  });
});

describe("aggregateRollupForWatch", () => {
  it("최근 24시간·이전 날짜별·시험 기기를 나눈다", () => {
    const now = Date.parse("2026-11-20T01:00:00Z");
    const rows = [
      { bucket_hour: "2026-11-19T10:00:00Z", category: "server.supabase_route", metric: HOME_FEED, event_count: 100, value_count: 10 },
      { bucket_hour: "2026-11-19T11:00:00Z", category: "server.supabase_route", metric: HOME_FEED, event_count: 50, value_count: 5 },
      { bucket_hour: "2026-11-19T11:00:00Z", category: "server.supabase_route_test", metric: HOME_FEED, event_count: 70, value_count: 7 },
      { bucket_hour: "2026-11-18T12:00:00Z", category: "server.supabase_route", metric: HOME_FEED, event_count: 30, value_count: 3 },
      { bucket_hour: "2026-11-17T12:00:00Z", category: "server.supabase_route", metric: HOME_FEED, event_count: 20, value_count: 2 },
    ];
    const a = aggregateRollupForWatch(rows, now);
    expect(a.last24h).toEqual([{ metric: HOME_FEED, calls: 150, requests: 15 }]);
    expect(a.testCalls24h).toBe(70);
    expect(a.previousDailyTotals.slice(0, 2)).toEqual([30, 20]);
  });
});
