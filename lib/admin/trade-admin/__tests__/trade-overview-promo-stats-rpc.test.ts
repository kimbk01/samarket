/**
 * R7 후속 — 거래 개요 통계 (가짜 DB).
 * 거래 문의 범위(처리 대기·기간 접수)·홍보 포인트 사용·환급은 RPC `admin_trade_overview_promo_stats` 한 번 —
 * 거래 홍보 주문 id 500건 모으기(in(...))·원장 5,000행 읽어 합산 경로가 없어야 한다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SUPPORT_TRADE_CATEGORY,
  SUPPORT_TRADE_REFERENCE_TYPES,
  supportTradeScopeOrFilter,
} from "@/lib/support/support-community-filter";

vi.mock("@/lib/admin/trade-admin/trade-posts-query", () => ({
  loadTradePostsContext: async () => ({ ok: false, error: "ctx_off" }),
  parseTradePostsFilter: () => ({ ok: true, filter: {} }),
  countTradePosts: async () => null,
  resolveTradePostLguIds: async () => new Map(),
}));

type Call = { table: string; selectCols?: string; filters: Array<[string, string, unknown]>; limit?: number };
const calls: Call[] = [];
type RpcCall = { fn: string; args: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
/** 함수별 결과 (없으면 rpcResult) */
const rpcByFn: Record<string, { data: unknown; error: unknown }> = {};

function from(table: string) {
  const call: Call = { table, filters: [] };
  const b: Record<string, unknown> = {};
  const chain =
    (fn: (...a: unknown[]) => void) =>
    (...a: unknown[]) => {
      fn(...a);
      return b;
    };
  const filter = (kind: string) => chain((c, v) => call.filters.push([kind, String(c), v]));
  Object.assign(b, {
    select: chain((cols) => {
      call.selectCols = String(cols ?? "*");
    }),
    eq: filter("eq"),
    is: filter("is"),
    in: filter("in"),
    gt: filter("gt"),
    gte: filter("gte"),
    lt: filter("lt"),
    lte: filter("lte"),
    filter: chain((c, op, v) => call.filters.push(["filter", String(c), [op, v]])),
    not: chain((c, op, v) => call.filters.push(["not", String(c), [op, v]])),
    or: chain((v) => call.filters.push(["or", "", v])),
    order: chain(() => undefined),
    limit: chain((n) => {
      call.limit = Number(n);
    }),
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
      calls.push(call);
      return Promise.resolve({ data: [], error: null, count: 7 }).then(ok, err);
    },
  });
  return b;
}
const fakeSb = {
  from,
  rpc: async (fn: string, args: Record<string, unknown> = {}) => {
    rpcCalls.push({ fn, args });
    return rpcByFn[fn] ?? rpcResult;
  },
};

const PERIOD = {
  fromIso: "2026-09-30T16:00:00.000Z",
  toIso: "2026-10-20T16:00:00.000Z",
  fromDate: "2026-10-01",
  toDate: "2026-10-20",
};

async function load(summaryOnly = false) {
  const { loadTradeOverview } = await import("@/lib/admin/trade-admin/trade-metrics");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return loadTradeOverview(fakeSb as any, PERIOD, { summaryOnly });
}

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  for (const k of Object.keys(rpcByFn)) delete rpcByFn[k];
  rpcResult = {
    data: { open_support: 12, support_received: 34, points_used: 2000, points_refunded: 150 },
    error: null,
  };
});

describe("거래 개요 — 홍보 주문 id 500건·원장 5,000행 상한 제거 (DB 집계 RPC)", () => {
  it("RPC 한 번 · 인자 = 기간 [from, to) + 거래 문의 범위 상수(TS 정의) · 값 = RPC 결과", async () => {
    const o = await load();
    const promo = rpcCalls.filter((c) => c.fn === "admin_trade_overview_promo_stats");
    expect(promo).toHaveLength(1);
    expect(promo[0].args).toEqual({
      p_from: PERIOD.fromIso,
      p_to: PERIOD.toIso,
      p_open_statuses: ["OPEN", "WAITING_ADMIN"],
      p_reference_types: [...SUPPORT_TRADE_REFERENCE_TYPES],
      p_category: SUPPORT_TRADE_CATEGORY,
      p_with_points: true,
    });
    expect(o.pending.openSupport).toBe(12);
    expect(o.inPeriod.supportReceived).toBe(34);
    expect(o.inPeriod.promotionPointsUsed).toBe(2000);
    expect(o.inPeriod.promotionPointsRefunded).toBe(150);
  });

  it("홍보 주문 id 모으기·원장 직접 읽기·문의 in(...) 필터 없음", async () => {
    await load();
    expect(calls.some((c) => c.table === "point_ledger")).toBe(false);
    expect(calls.some((c) => c.table === "promotion_point_holds")).toBe(false);
    expect(calls.some((c) => c.table === "support_cases")).toBe(false);
    // 홍보 주문 테이블은 head count 만 (id 목록 조회·limit 없음)
    for (const c of calls.filter((x) => x.table === "point_promotion_orders")) {
      expect(c.limit).toBeUndefined();
    }
  });

  it("요약 모드 → p_with_points=false · 포인트 합계 null · 문의 건수는 그대로", async () => {
    rpcResult = { data: { open_support: 3, support_received: 4, points_used: null, points_refunded: null }, error: null };
    const o = await load(true);
    expect(rpcCalls.find((c) => c.fn === "admin_trade_overview_promo_stats")?.args.p_with_points).toBe(false);
    expect(o.pending.openSupport).toBe(3);
    expect(o.inPeriod.supportReceived).toBe(4);
    expect(o.inPeriod.promotionPointsUsed).toBeNull();
    expect(o.inPeriod.promotionPointsRefunded).toBeNull();
  });

  it("RPC 실패 → null(확인 불가) + errors (0 으로 덮지 않음)", async () => {
    rpcResult = { data: null, error: { message: "function missing" } };
    const o = await load();
    expect(o.pending.openSupport).toBeNull();
    expect(o.inPeriod.supportReceived).toBeNull();
    expect(o.inPeriod.promotionPointsUsed).toBeNull();
    expect(o.errors).toContain("trade_promo_stats:function missing");
  });
});

describe("거래 문의 범위 — TS(목록 or 필터)와 SQL(지표 RPC) 같은 정의", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20270601190000_r7_support_case_promotion_domain.sql"),
    "utf8"
  );

  it("TS or 필터 = 범위 상수(참조 유형·카테고리) + 거래 홍보 주문 참조", () => {
    const f = supportTradeScopeOrFilter();
    expect(f).toContain(`reference_type.in.(${SUPPORT_TRADE_REFERENCE_TYPES.join(",")})`);
    expect(f).toContain(`category.eq.${SUPPORT_TRADE_CATEGORY}`);
    // 홍보 주문 참조 = DB 계산 열 (주문 id 목록 없음 · 상한 없음)
    expect(f).toContain("support_case_promotion_domain.eq.trade");
    expect(f).not.toContain("reference_id.in.");
  });

  it("SQL 은 같은 상수를 인자로 받고 거래 홍보 주문 전체(상한 없음)와 조인 · 원장은 기존 도메인 원장 RPC 재사용", () => {
    expect(sql).toContain("s.category = p_category");
    expect(sql).toContain("s.reference_type = ANY (coalesce(p_reference_types");
    // 홍보 주문 도메인 판정 = 목록 or 필터와 같은 계산 열 (단일 정의)
    expect(sql).toContain("OR public.support_case_promotion_domain(s) = 'trade'");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.support_case_promotion_domain(s public.support_cases)");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.support_case_promotion_domain\(public\.support_cases\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toContain("public.admin_point_ledger_domain_page(");
    expect(sql).not.toMatch(/LIMIT\s+\d{3,}/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_trade_overview_promo_stats\([^)]*\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_trade_overview_promo_stats\([^)]*\) TO service_role;/);
  });
});

describe("거래 개요 — 카테고리·지역 분포 5,000행 상한 제거 (DB 집계)", () => {
  it("분포 = RPC 2개(기간 [from, to) · 상위 10) · posts 직접 읽기 없음 · 이름 규칙 유지", async () => {
    rpcByFn.admin_trade_category_stats = {
      data: { total: 3, post_total: 9000, rows: [
        { id: "c1", name: "전자", count: 6000 },
        { id: "c2", name: null, count: 2000 },
        { id: null, name: null, count: 1000 },
      ] },
      error: null,
    };
    rpcByFn.admin_trade_region_stats = {
      data: { ok: true, total: 2, post_total: 9000, rows: [
        { lgu_id: "L1", name: "마닐라 · NCR", posts: 8000 },
        { lgu_id: null, name: "지역 확인 불가", posts: 1000 },
      ] },
      error: null,
    };
    const o = await load();
    expect(rpcCalls.find((c) => c.fn === "admin_trade_category_stats")?.args).toEqual({
      p_from: PERIOD.fromIso, p_to: PERIOD.toIso, p_limit: 10,
    });
    expect(rpcCalls.find((c) => c.fn === "admin_trade_region_stats")?.args).toEqual({
      p_from: PERIOD.fromIso, p_to: PERIOD.toIso, p_limit: 10, p_offset: 0,
    });
    expect(calls.some((c) => c.table === "posts" && c.limit !== undefined)).toBe(false);
    expect(o.byCategory).toEqual([
      { id: "c1", name: "전자", count: 6000 },
      { id: "c2", name: "알 수 없는 카테고리", count: 2000 },
      { id: null, name: "카테고리 없음", count: 1000 },
    ]);
    expect(o.byRegion).toEqual([
      { lguId: "L1", name: "마닐라 · NCR", count: 8000 },
      { lguId: null, name: "지역 확인 불가", count: 1000 },
    ]);
  });

  it("분포 RPC 실패 → null + errors · 요약 모드는 분포 RPC 를 부르지 않음", async () => {
    rpcByFn.admin_trade_category_stats = { data: null, error: { message: "boom" } };
    rpcByFn.admin_trade_region_stats = { data: { ok: false, error: "forbidden" }, error: null };
    const o = await load();
    expect(o.byCategory).toBeNull();
    expect(o.byRegion).toBeNull();
    expect(o.errors).toContain("distribution_category:boom");
    expect(o.errors).toContain("distribution_region:forbidden");
    rpcCalls.length = 0;
    await load(true);
    expect(rpcCalls.some((c) => c.fn === "admin_trade_category_stats" || c.fn === "admin_trade_region_stats")).toBe(false);
  });

  it("카테고리 집계 SQL — 기간 [from, to) · 상위 N · service_role 만", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20270601191000_r7_trade_category_stats.sql"), "utf8");
    expect(sql).toContain("(p_from IS NULL OR p.created_at >= p_from)");
    expect(sql).toContain("(p_to IS NULL OR p.created_at < p_to)");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_trade_category_stats\([^)]*\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_trade_category_stats\([^)]*\) TO service_role;/);
  });
});
