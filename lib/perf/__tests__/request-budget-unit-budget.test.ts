/** 2026-11-22 단위 예산 판정 — 호출 > (요청 1번당 × 요청 + 단위 1개당 × 단위) × 1.2 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/perf/request-budget", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ROUTE_SUPABASE_CALL_UNIT_BUDGET: {
    "/api/community-messenger/rooms/[roomId]/messages@post": { perRequest: 30, perUnit: 10 },
  },
}));

describe("단위 예산", () => {
  it("허용 이하 → 경보 없음 · 초과 → route_over_budget(1번당 허용값으로 표시)", async () => {
    const { evaluateRequestBudget } = await import("@/lib/perf/request-budget-watch");
    const { routeLabelToRollupMetric } = await import("@/lib/perf/supabase-call-counter");
    const metric = routeLabelToRollupMetric("/api/community-messenger/rooms/[roomId]/messages", "post");
    // 허용 = 30×40 + 10×60 = 1800 → ×1.2 = 2160
    const ok = evaluateRequestBudget({
      last24h: [{ metric, calls: 2100, requests: 40, units: 60 }],
      previousDailyTotals: [],
      testCalls24h: 0,
    });
    expect(ok.breaches).toEqual([]);
    const over = evaluateRequestBudget({
      last24h: [{ metric, calls: 2200, requests: 40, units: 60 }],
      previousDailyTotals: [],
      testCalls24h: 0,
    });
    expect(over.breaches).toEqual([
      {
        kind: "route_over_budget",
        route: "/api/community-messenger/rooms/[roomId]/messages@post",
        perRequest: 55,
        budget: 45,
        calls: 2200,
        requests: 40,
      },
    ]);
  });

  it("값 없는 표지 키(지금 운영) → 하루 1,000건 이상이면 unbudgeted_route", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/perf/request-budget");
    const { evaluateRequestBudget } = await import("@/lib/perf/request-budget-watch");
    const { routeLabelToRollupMetric } = await import("@/lib/perf/supabase-call-counter");
    const metric = routeLabelToRollupMetric("/api/community-messenger/rooms/[roomId]/messages", "post");
    const r = evaluateRequestBudget({
      last24h: [{ metric, calls: 1200, requests: 25, units: 30 }],
      previousDailyTotals: [],
      testCalls24h: 0,
    });
    expect(r.breaches).toEqual([{ kind: "unbudgeted_route", metric, calls: 1200, requests: 25 }]);
  });
});
