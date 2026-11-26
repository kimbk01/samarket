/**
 * 2026-11-26 C — 요청 예산 감시의 Vercel 관측 판정.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/budget-alert-final-2026-11-26.md §2-C
 */
import { describe, expect, it, vi } from "vitest";
import {
  loadVercelRequestBudgetUsage,
  observabilityRows,
  rowCount,
  utcDayWindow,
  vercelRouteToMetric,
} from "@/lib/perf/request-budget-vercel-usage.server";
import { evaluateRequestBudget } from "@/lib/perf/request-budget-watch";

const NOW = Date.parse("2026-11-27T01:00:00Z");

function fakeFetch(bodies: Record<string, unknown>) {
  const calls: Array<{ url: string; body: Record<string, unknown>; auth: string | null }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body, auth: new Headers(init?.headers).get("authorization") });
    const key = `${body.metric}${body.groupBy ? `|${(body.groupBy as string[]).join(",")}` : ""}`;
    const b = bodies[key];
    if (b === undefined) return new Response("{}", { status: 500 });
    return new Response(JSON.stringify(b), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const OK_BODIES = {
  "vercel.external_api_request.count|origin_route": {
    data: [
      { timestamp: "2026-11-26T00:00:00.000Z", origin_route: "/api/admin/admin-bell", vercel_external_api_request_count_sum: 800 },
      { timestamp: "2026-11-26T00:00:00.000Z", origin_route: "/api/me/store-owner-hub-badge", vercel_external_api_request_count_sum: 223 },
      { timestamp: "2026-11-26T00:00:00.000Z", origin_route: "/_middleware", vercel_external_api_request_count_sum: 2928 },
    ],
  },
  "vercel.request.count|route": {
    data: [
      { timestamp: "2026-11-26T00:00:00.000Z", route: "/api/admin/admin-bell", vercel_request_count_sum: 200 },
      { timestamp: "2026-11-26T00:00:00.000Z", route: "/api/me/store-owner-hub-badge", vercel_request_count_sum: 219 },
      { timestamp: "2026-11-26T00:00:00.000Z", route: "/", vercel_request_count_sum: 999 },
    ],
  },
  "vercel.external_api_request.count": {
    data: [
      { timestamp: "2026-11-25T00:00:00.000Z", vercel_external_api_request_count_sum: 40000 },
      { timestamp: "2026-11-19T00:00:00.000Z", vercel_external_api_request_count_sum: 30000 },
    ],
  },
};

describe("해석", () => {
  it("응답 감싸기 두 모양 · 합계 키 표기 두 모양", () => {
    expect(observabilityRows({ result: { data: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
    expect(observabilityRows({ data: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(observabilityRows({})).toBeNull();
    expect(rowCount({ vercel_request_count_sum: 5 })).toBe(5);
    expect(rowCount({ vercelRequestCountSum: 7 })).toBe(7);
    expect(rowCount({ vercel_request_count_sum: null })).toBe(0);
    expect(rowCount({ route: "/x" })).toBeNull();
  });

  it("미들웨어·빈 라우트 = unknown, 나머지는 계수기 metric 규칙", () => {
    expect(vercelRouteToMetric("/_middleware")).toBe("unknown");
    expect(vercelRouteToMetric(null)).toBe("unknown");
    expect(vercelRouteToMetric("/api/community-messenger/rooms/[roomId]/messages")).toBe(
      "api.community-messenger.rooms.:roomid.messages",
    );
  });

  it("창 = 직전 UTC 하루", () => {
    const w = utcDayWindow(NOW);
    expect(new Date(w.start).toISOString()).toBe("2026-11-26T00:00:00.000Z");
    expect(new Date(w.end).toISOString()).toBe("2026-11-27T00:00:00.000Z");
  });
});

describe("loadVercelRequestBudgetUsage", () => {
  it("토큰 없음 → 조회하지 않고 null (계수기 판정)", async () => {
    const { impl, calls } = fakeFetch(OK_BODIES);
    expect(await loadVercelRequestBudgetUsage(NOW, { env: {}, fetchImpl: impl })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("라우트별 호출·요청 · 이전 7일 합계 · 토큰은 Authorization 머리글로만", async () => {
    const { impl, calls } = fakeFetch(OK_BODIES);
    const u = await loadVercelRequestBudgetUsage(NOW, { env: { VERCEL_OBSERVABILITY_TOKEN: " tok " }, fetchImpl: impl });
    expect(u).not.toBeNull();
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      expect(c.auth).toBe("Bearer tok");
      expect(c.url).not.toContain("tok");
      expect(c.body.scope).toEqual({
        type: "project",
        ownerId: "team_pvmVIRp0rvayJ1LN07RLLlft",
        projectIds: ["prj_F75kGK83Sd7B4An6IURjQUc0VW5D"],
      });
    }
    const m = new Map(u!.last24h.map((r) => [r.metric, r]));
    expect(m.get("api.admin.admin-bell")).toEqual({ metric: "api.admin.admin-bell", calls: 800, requests: 200 });
    expect(m.get("api.me.store-owner-hub-badge")).toEqual({ metric: "api.me.store-owner-hub-badge", calls: 223, requests: 219 });
    expect(m.get("unknown")?.calls).toBe(2928);
    /** Supabase 를 안 부른 라우트는 판정 대상에 넣지 않는다 */
    expect(m.has("root")).toBe(false);
    expect(u!.previousDailyTotals[0]).toBe(40000);
    expect(u!.previousDailyTotals[6]).toBe(30000);
    expect(u!.windowStart).toBe("2026-11-26T00:00:00.000Z");
  });

  it("판정: 계수기에서 가짜 초과이던 허브 배지가 Vercel 값으로는 정상 · 미들웨어는 예산 없는 라우트 경보 안 냄", async () => {
    const { impl } = fakeFetch(OK_BODIES);
    const u = await loadVercelRequestBudgetUsage(NOW, { env: { VERCEL_OBSERVABILITY_TOKEN: "t" }, fetchImpl: impl });
    const r = evaluateRequestBudget({ last24h: u!.last24h, previousDailyTotals: u!.previousDailyTotals, testCalls24h: 0 });
    expect(r.breaches.filter((b) => b.kind === "route_over_budget")).toEqual([]);
    expect(r.breaches.some((b) => b.kind === "unbudgeted_route")).toBe(false);
  });

  it.each([
    ["HTTP 오류", { ...OK_BODIES, "vercel.request.count|route": undefined }],
    ["해석 불가(data 없음)", { ...OK_BODIES, "vercel.request.count|route": { nope: 1 } }],
    ["합계 키 없음", { ...OK_BODIES, "vercel.external_api_request.count|origin_route": { data: [{ origin_route: "/x" }] } }],
    ["호출 0", { ...OK_BODIES, "vercel.external_api_request.count|origin_route": { data: [] } }],
  ])("%s → null (계수기 판정으로)", async (_l, bodies) => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { impl } = fakeFetch(bodies as Record<string, unknown>);
    expect(await loadVercelRequestBudgetUsage(NOW, { env: { VERCEL_OBSERVABILITY_TOKEN: "t" }, fetchImpl: impl })).toBeNull();
    err.mockRestore();
  });
});
