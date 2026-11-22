/**
 * 2026-11-22 요청 표지 — 메시지 보내기(POST)를 목록 읽기(GET)와 따로 센다 · 받는 사람 수 · 표별 셈.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/request-budget-method-split-design-2026-11-22.md
 */
import { describe, expect, it } from "vitest";
import {
  SUPABASE_ROUTE_CATEGORY,
  SUPABASE_ROUTE_TARGET_CATEGORY,
  SUPABASE_ROUTE_UNITS_CATEGORY,
  SupabaseCallCounter,
  budgetKeyToRollupMetric,
  routeLabelToRollupMetric,
  routeToRollupMetric,
} from "@/lib/perf/supabase-call-counter";
import { aggregateRollupForWatch } from "@/lib/perf/request-budget-watch.server";

const ORIGIN = "https://proj.supabase.co";
const METRIC_RE = /^[a-z0-9_.:-]{1,96}$/; // 운영 cm_monitoring_rollup_add 검사식
const ROUTE = "/api/community-messenger/rooms/[roomId]/messages";
const UA = "Mozilla/5.0";

function ctx(key: object) {
  return { route: ROUTE, requestKey: key, userAgent: UA };
}

describe("표지 키 규칙", () => {
  it("표지 붙은 키 = 라우트 + ::post · 집계 함수 검사식 통과", () => {
    const m = routeLabelToRollupMetric(ROUTE, "post");
    expect(m).toBe("api.community-messenger.rooms.:roomid.messages::post");
    expect(m).toMatch(METRIC_RE);
    expect(budgetKeyToRollupMetric(`${ROUTE}@post`)).toBe(m);
    expect(budgetKeyToRollupMetric(ROUTE)).toBe(routeToRollupMetric(ROUTE));
  });
  it("표별 키도 검사식 통과(96자 자름)", () => {
    const c = new SupabaseCallCounter(ORIGIN);
    const k = {};
    c.tag(ctx(k), "post");
    c.record(`${ORIGIN}/rest/v1/rpc/${"a".repeat(80)}`, ctx(k));
    for (const r of c.drain()) expect(r.metric).toMatch(METRIC_RE);
  });
});

describe("표지 요청 셈", () => {
  it("POST(표지)와 GET(표지 없음)이 다른 키로 · 받는 사람 수 · 표별 셈", () => {
    const c = new SupabaseCallCounter(ORIGIN);
    const post = {};
    const get = {};
    expect(c.tag(ctx(post), "post")).toBe(true);
    c.record(`${ORIGIN}/rest/v1/notification_events?id=eq.1`, ctx(post));
    c.record(`${ORIGIN}/rest/v1/rpc/send_message`, ctx(post));
    c.addUnits(ctx(post), 3);
    c.record(`${ORIGIN}/rest/v1/community_messenger_messages?x=1`, ctx(get));
    expect(c.addUnits(ctx(get), 5)).toBe(false); // 표지 없는 요청은 단위 없음
    const rows = c.drain();
    const find = (cat: string, metric: string) => rows.find((r) => r.category === cat && r.metric === metric);
    const postMetric = routeLabelToRollupMetric(ROUTE, "post");
    expect(find(SUPABASE_ROUTE_CATEGORY, postMetric)).toMatchObject({ event_count: 2, value_count: 1 });
    expect(find(SUPABASE_ROUTE_CATEGORY, routeToRollupMetric(ROUTE))).toMatchObject({ event_count: 1, value_count: 1 });
    expect(find(SUPABASE_ROUTE_UNITS_CATEGORY, postMetric)).toMatchObject({ event_count: 3, value_count: 0 });
    expect(find(SUPABASE_ROUTE_TARGET_CATEGORY, `${postMetric}::rest.notification_events`)?.event_count).toBe(1);
    expect(find(SUPABASE_ROUTE_TARGET_CATEGORY, `${postMetric}::rpc.send_message`)?.event_count).toBe(1);
    // 표지 없는 요청은 표별 셈 없음
    expect(rows.filter((r) => r.category === SUPABASE_ROUTE_TARGET_CATEGORY)).toHaveLength(2);
  });

  it("이미 셈이 있는 요청에는 표지를 달지 않는다(한 요청이 두 키로 갈리지 않게)", () => {
    const c = new SupabaseCallCounter(ORIGIN);
    const k = {};
    c.record(`${ORIGIN}/rest/v1/a`, ctx(k));
    expect(c.tag(ctx(k), "post")).toBe(false);
    c.record(`${ORIGIN}/rest/v1/b`, ctx(k));
    const rows = c.drain();
    expect(rows.find((r) => r.metric === routeToRollupMetric(ROUTE))?.event_count).toBe(2);
  });

  it("drain 뒤에도 같은 요청(응답 뒤 작업)은 같은 표지 키로 센다 · 요청 수는 1번만", () => {
    const c = new SupabaseCallCounter(ORIGIN);
    const k = {};
    c.tag(ctx(k), "post");
    c.record(`${ORIGIN}/rest/v1/a`, ctx(k));
    c.drain();
    c.record(`${ORIGIN}/rest/v1/b`, ctx(k));
    const row = c.drain().find((r) => r.category === SUPABASE_ROUTE_CATEGORY);
    expect(row).toMatchObject({ metric: routeLabelToRollupMetric(ROUTE, "post"), event_count: 1, value_count: 0 });
  });

  it("시험 기기 요청은 단위·표별 셈을 저장하지 않는다", () => {
    const c = new SupabaseCallCounter(ORIGIN);
    const k = {};
    const testCtx = { route: ROUTE, requestKey: k, userAgent: "Mozilla/5.0 (Linux; Android 16; SM-M156S)" };
    c.tag(testCtx, "post");
    c.record(`${ORIGIN}/rest/v1/a`, testCtx);
    c.addUnits(testCtx, 2);
    const rows = c.drain();
    expect(rows.some((r) => r.category === "server.supabase_route_test")).toBe(true);
    expect(rows.some((r) => r.category === SUPABASE_ROUTE_UNITS_CATEGORY)).toBe(false);
    expect(rows.some((r) => r.category === SUPABASE_ROUTE_TARGET_CATEGORY)).toBe(false);
  });
});

describe("감시 집계 — 단위 행", () => {
  it("단위 행은 호출 합계·전일 비교에 들어가지 않고 그 키의 units 로만", () => {
    const now = Date.parse("2026-11-22T01:00:00Z");
    const hour = "2026-11-22T00:00:00Z";
    const postMetric = routeLabelToRollupMetric(ROUTE, "post");
    const agg = aggregateRollupForWatch(
      [
        { bucket_hour: hour, category: SUPABASE_ROUTE_CATEGORY, metric: postMetric, event_count: 450, value_count: 10 },
        { bucket_hour: hour, category: SUPABASE_ROUTE_UNITS_CATEGORY, metric: postMetric, event_count: 14, value_count: 0 },
      ],
      now,
    );
    expect(agg.last24h).toEqual([{ metric: postMetric, calls: 450, requests: 10, units: 14 }]);
  });
});

describe("tagSupabaseCallRequest — 설치된 계수기로 지금 요청에 표지", () => {
  it("설치 전엔 아무것도 안 함 · 설치 뒤 같은 요청 호출이 표지 키로", async () => {
    const { installSupabaseCallCounter, tagSupabaseCallRequest, addSupabaseCallRequestUnits } = await import(
      "@/lib/perf/supabase-call-counter"
    );
    const original = globalThis.fetch;
    const g = globalThis as Record<symbol, unknown>;
    try {
      expect(() => tagSupabaseCallRequest("post")).not.toThrow();
      globalThis.fetch = (async () => new Response("ok")) as unknown as typeof fetch;
      const key = {};
      const counter = installSupabaseCallCounter({
        supabaseUrl: ORIGIN,
        serviceKey: "k",
        readContext: () => ({ route: ROUTE, requestKey: key, userAgent: UA }),
      })!;
      tagSupabaseCallRequest("post");
      await globalThis.fetch(`${ORIGIN}/rest/v1/a`);
      addSupabaseCallRequestUnits(2);
      const rows = counter.drain();
      const m = routeLabelToRollupMetric(ROUTE, "post");
      expect(rows.find((r) => r.category === SUPABASE_ROUTE_CATEGORY)?.metric).toBe(m);
      expect(rows.find((r) => r.category === SUPABASE_ROUTE_UNITS_CATEGORY)?.event_count).toBe(2);
    } finally {
      globalThis.fetch = original;
      delete g[Symbol.for("dibay.supabaseCallCounter.installed")];
      delete g[Symbol.for("dibay.supabaseCallCounter.readContext")];
    }
  });
});
