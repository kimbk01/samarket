/**
 * R7 — 재무 목록 서버 페이지 계약 (가짜 DB).
 * - 통합 거래 `/admin/finance/transactions`: 현금·코인·포인트 원장 병합·필터·정렬·페이지·total = RPC `admin_finance_unified_tx_page` 한 번.
 * - 매장별 재무 `/admin/finance/stores`: 활동 매장 전체 페이지 = RPC `admin_finance_store_activity_page` (예전 거래 120건 → 매장 24개 아님).
 * - 광고 지출 `/admin/finance/ads`: 다섯 출처 병합·페이지 = RPC `admin_finance_ad_funding_page` (예전 출처별 N건 → 80건 아님).
 * 원장 테이블을 직접 최신 N건씩 읽지 않는다. 기존 응답 키(`transactions`·`rows`·`traces`)는 다른 호출자 호환으로 유지.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Call = { kind: "rpc" | "from"; name: string; args?: unknown; ops: string[] };
const calls: Call[] = [];
const rpcPayloads: Record<string, unknown> = {};

function fromChain(name: string) {
  const call: Call = { kind: "from", name, ops: [] };
  calls.push(call);
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "in", "eq", "or", "order", "limit", "range", "gte", "lte"]) {
    chain[op] = (...a: unknown[]) => {
      call.ops.push(`${op}:${JSON.stringify(a)}`);
      return chain;
    };
  }
  chain.then = (res: (v: unknown) => unknown) =>
    Promise.resolve({
      data: name === "stores" ? [{ id: "11111111-1111-1111-1111-111111111111", store_name: "가게 A" }] : [],
      error: null,
    }).then(res);
  return chain;
}

const fakeSb = {
  rpc: (name: string, args: unknown) => {
    calls.push({ kind: "rpc", name, args, ops: [] });
    return Promise.resolve({ data: rpcPayloads[name] ?? { total: 0, rows: [] }, error: null });
  },
  from: (name: string) => fromChain(name),
};

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, sb: fakeSb, actor: { userId: "admin-1", isSuperAdmin: true } }),
}));
const loadStoreStatement = vi.fn();
vi.mock("@/lib/finance/store-statement/load-store-statement", () => ({
  loadStoreStatement: (...a: unknown[]) => loadStoreStatement(...a),
}));

import { GET as getTransactions } from "@/app/api/admin/finance/transactions/route";
import { GET as getStoresIndex } from "@/app/api/admin/finance/stores-index/route";
import { GET as getAdFunding } from "@/app/api/admin/finance/ad-funding-traces/route";
import {
  ADMIN_FINANCE_UNIFIED_TX_PAGE_RPC,
  loadUnifiedFinanceTransactionByKey,
  unifiedTxPageRpcArgs,
} from "@/lib/finance/unified-transaction/load-unified-transactions";
import { ADMIN_FINANCE_STORE_ACTIVITY_PAGE_RPC } from "@/lib/finance/store-index/load-finance-stores-index";
import {
  ADMIN_FINANCE_AD_FUNDING_PAGE_RPC,
  adFundingPageRpcArgs,
} from "@/lib/finance/ad-funding-trace/load-ad-funding-trace-page";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const STORE = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";
const LEDGER_TABLES = ["business_cash_ledger", "store_economic_point_ledger", "point_ledger"];
const AD_TABLES = [
  "delivery_ad_canonical_bc_fundings",
  "feed_ad_requests",
  "feed_ad_point_holds",
  "point_promotion_orders",
  "platform_popup_campaigns",
];

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(rpcPayloads)) delete rpcPayloads[k];
  loadStoreStatement.mockReset();
});

describe("통합 거래 — R7 서버 페이지", () => {
  it("limit/offset·필터 → RPC 인자 (페이지 상한 100, 잘못된 id 는 일치 없음 값)", () => {
    const { args } = unifiedTxPageRpcArgs({
      wallet: "CASH",
      type: "SALE_FEE",
      direction: "credit",
      storeId: STORE,
      orderId: " ORD-1 ",
      adId: "AD-1",
      memberId: "not-a-uuid",
      fromIso: "2026-10-01T00:00:00Z",
      toIso: "2026-10-02T00:00:00Z",
      limit: 500,
      offset: 200,
    });
    expect(args).toEqual({
      p_wallet: "CASH",
      p_type: "SALE_FEE",
      p_direction: "credit",
      p_store_id: STORE,
      p_order_id: "ORD-1",
      p_ad_id: "AD-1",
      p_member_id: "00000000-0000-0000-0000-000000000000",
      p_from: "2026-10-01T00:00:00Z",
      p_to: "2026-10-02T00:00:00Z",
      p_tx_id: null,
      p_limit: 100,
      p_offset: 200,
    });
  });

  it("API: RPC 한 번 · DB total · 행 변환(현금 광고 id·포인트 유형은 SQL 값) · 원장 직접 조회 없음", async () => {
    rpcPayloads[ADMIN_FINANCE_UNIFIED_TX_PAGE_RPC] = {
      total: 987,
      rows: [
        {
          wallet: "CASH", id: "c1", created_at: "2026-10-19T10:00:00Z", entry_kind: "AD_SPEND", direction: "debit", ad_id: "APP-1",
          row: { id: "c1", store_id: STORE, entry_kind: "AD_SPEND", amount_minor: 12345, balance_after_minor: 500, related_type: "delivery_ad", related_id: "", meta: { application_id: "APP-1" } },
        },
        {
          wallet: "POINT", id: "p1", created_at: "2026-10-19T09:00:00Z", entry_kind: "POINT_HOLD", direction: "debit", ad_id: "REQ-1",
          row: { id: "p1", user_id: MEMBER, entry_type: "ad_hold", amount: -50, balance_after: 10, related_type: "feed_ad_request", related_id: "REQ-1", description: "hold" },
        },
      ],
    };
    const res = await getTransactions(new NextRequest("https://x.test/api/admin/finance/transactions?wallet=cash&limit=20&offset=40"));
    const json = (await res.json()) as { ok: boolean; total: number; limit: number; offset: number; transactions: Record<string, unknown>[] };
    expect(json.ok).toBe(true);
    expect(json.total).toBe(987);
    expect(json.limit).toBe(20);
    expect(json.offset).toBe(40);
    expect(json.transactions.map((t) => t.txKey)).toEqual(["cash:c1", "point:p1"]);
    expect(json.transactions[0]).toMatchObject({ wallet: "CASH", amount: 123.45, adId: "APP-1", storeName: "가게 A", direction: "debit" });
    expect(json.transactions[1]).toMatchObject({ wallet: "POINT", entryKind: "POINT_HOLD", amount: 50, memberId: MEMBER, adId: "REQ-1" });

    const rpc = calls.filter((c) => c.kind === "rpc");
    expect(rpc).toHaveLength(1);
    expect(rpc[0].args).toMatchObject({ p_wallet: "CASH", p_limit: 20, p_offset: 40 });
    expect(calls.some((c) => c.kind === "from" && LEDGER_TABLES.includes(c.name))).toBe(false);
  });

  it("다른 호출자 (허브 limit=40 · 기본 80) 는 같은 응답 키 `transactions` 를 받는다", async () => {
    await getTransactions(new NextRequest("https://x.test/api/admin/finance/transactions?limit=40"));
    await getTransactions(new NextRequest("https://x.test/api/admin/finance/transactions"));
    const rpc = calls.filter((c) => c.kind === "rpc").map((c) => c.args as Record<string, unknown>);
    expect(rpc.map((a) => a.p_limit)).toEqual([40, 80]);
    expect(rpc.every((a) => a.p_offset === 0)).toBe(true);
  });

  it("상세(txKey)는 최근 N건 안에서 찾지 않고 id 로 직접 찾는다", async () => {
    const id = "33333333-3333-3333-3333-333333333333";
    rpcPayloads[ADMIN_FINANCE_UNIFIED_TX_PAGE_RPC] = {
      total: 1,
      rows: [{ wallet: "COIN", id, created_at: "2026-01-01T00:00:00Z", entry_kind: "SALE_EARN", direction: "credit", ad_id: null, row: { id, store_id: STORE, amount: 7, balance_after: 7, related_id: "ORD-9" } }],
    };
    const tx = await loadUnifiedFinanceTransactionByKey(fakeSb as never, `coin:${id}`);
    expect(tx?.txKey).toBe(`coin:${id}`);
    expect(tx?.orderId).toBe("ORD-9");
    const rpc = calls.filter((c) => c.kind === "rpc");
    expect(rpc[0].args).toMatchObject({ p_wallet: "COIN", p_tx_id: id, p_limit: 1 });
  });
});

describe("매장별 재무 — R7 서버 페이지", () => {
  it("활동 매장 전체를 limit/offset 으로 · DB total · 이 페이지 매장만 Store Statement", async () => {
    rpcPayloads[ADMIN_FINANCE_STORE_ACTIVITY_PAGE_RPC] = {
      total: 61,
      rows: [{ store_id: STORE, store_name: "가게 A", last_at: "2026-10-19T10:00:00Z", sample_kinds: ["SALE_FEE", "TOPUP"] }],
    };
    loadStoreStatement.mockResolvedValue({
      storeName: "가게 A",
      sales: { gross: 1000, settlementFee: 50 },
      coin: { earned: 7 },
      cash: { closingMinor: 9900 },
    });
    const res = await getStoresIndex(new NextRequest("https://x.test/api/admin/finance/stores-index?period=30d&limit=50&offset=50"));
    const json = (await res.json()) as { ok: boolean; total: number; limit: number; offset: number; rows: Record<string, unknown>[] };
    expect(json.ok).toBe(true);
    expect(json.total).toBe(61);
    expect(json.limit).toBe(50);
    expect(json.offset).toBe(50);
    expect(json.rows[0]).toMatchObject({ storeId: STORE, storeName: "가게 A", sampleKinds: ["SALE_FEE", "TOPUP"], gross: 1000, feeDue: 50 });
    expect(loadStoreStatement).toHaveBeenCalledTimes(1);
    const rpc = calls.filter((c) => c.kind === "rpc");
    expect(rpc).toHaveLength(1);
    expect(rpc[0].args).toEqual({ p_limit: 50, p_offset: 50 });
    expect(calls.some((c) => c.kind === "from" && LEDGER_TABLES.includes(c.name))).toBe(false);
  });
});

describe("광고 지출 — R7 서버 페이지", () => {
  it("필터 → RPC 인자 (결제 수단 화이트리스트, 상한 100)", () => {
    expect(adFundingPageRpcArgs({ storeId: STORE, fundingRail: "STORE_CASH", limit: 999, offset: 20 }).args).toEqual({
      p_store_id: STORE,
      p_member_id: null,
      p_rail: "STORE_CASH",
      p_limit: 100,
      p_offset: 20,
    });
    expect(adFundingPageRpcArgs({ fundingRail: "DROP TABLE" }).args.p_rail).toBeNull();
    expect(adFundingPageRpcArgs({}).args.p_limit).toBe(40);
  });

  it("API: RPC 한 번 · DB total · 출처별 변환 · 출처 테이블 직접 조회 없음 · 응답 키 `traces` 유지", async () => {
    rpcPayloads[ADMIN_FINANCE_AD_FUNDING_PAGE_RPC] = {
      total: 245,
      rows: [
        { source: "point_promotion_orders", id: "o1", row: { id: "o1", user_id: MEMBER, status: "ended", point_cost: 30, domain: "trade", start_at: "2026-10-19T00:00:00Z", end_at: "2026-10-20T00:00:00Z" } },
        { source: "delivery_ad_canonical_bc_fundings", id: "f1", row: { application_id: "app-1", store_id: STORE, owner_user_id: "owner-1", product_kind: "banner", status: "secured", amount_minor: 25000, spend_ledger_id: "led-1", refund_ledger_id: null } },
        { source: "feed_ad_requests", id: "r1", row: { id: "r1", user_id: MEMBER, status: "approved", point_cost: 10, domain: "community", hold_id: "h1", reviewed_at: "2026-10-18T00:00:00Z" } },
        { source: "platform_popup_campaigns", id: "pp1", row: { id: "pp1", status: "active", created_by: "admin-1", start_at: null, end_at: null } },
      ],
    };
    const res = await getAdFunding(new NextRequest("https://x.test/api/admin/finance/ad-funding-traces?limit=20&offset=20"));
    const json = (await res.json()) as { ok: boolean; total: number; traces: Record<string, unknown>[] };
    expect(json.ok).toBe(true);
    expect(json.total).toBe(245);
    expect(json.traces.map((t) => `${t.fundingRail}:${t.adId}`)).toEqual([
      "MEMBER_POINT:o1",
      "STORE_CASH:app-1",
      "MEMBER_POINT:r1",
      "ADMIN_DIRECT:pp1",
    ]);
    expect(json.traces[0]).toMatchObject({ adProduct: "trade_boost", status: "ended", activeAt: "2026-10-19T00:00:00Z" });
    expect(json.traces[1]).toMatchObject({ priceMinor: 25000, price: 250, ownerId: "owner-1", fundingTransactionId: "led-1" });
    expect(json.traces[2]).toMatchObject({ holdId: "h1", approvedAt: "2026-10-18T00:00:00Z" });
    expect(json.traces[3]).toMatchObject({ price: null, financeHref: null });
    const rpc = calls.filter((c) => c.kind === "rpc");
    expect(rpc).toHaveLength(1);
    expect(rpc[0].args).toMatchObject({ p_limit: 20, p_offset: 20 });
    expect(calls.some((c) => c.kind === "from" && AD_TABLES.includes(c.name))).toBe(false);
  });
});

describe("화면·SQL 계약", () => {
  it("세 화면은 서버 total + 표준 페이지네이션, 고정 100·24·80건 요청 없음", () => {
    const tx = read("components/finance/AdminFinanceTransactionsView.tsx");
    expect(tx).toContain("<AdminPagination");
    expect(tx).not.toContain('qs.set("limit", "100")');
    const stores = read("components/finance/AdminFinanceStoreViews.tsx");
    expect(stores).toContain("<AdminPagination");
    expect(stores).not.toContain("stores-index?period=30d&limit=24");
    const ads = read("components/finance/AdminFinanceAdsView.tsx");
    expect(ads).toContain("<AdminPagination");
    expect(ads).not.toContain('limit: "80"');
    expect(read("lib/finance/store-index/load-finance-stores-index.ts")).not.toContain("limit: 120");
  });

  it("사장님 재무 화면(ad-funding)은 기존 로더 그대로 · 마이그레이션 권한(service_role 만)", () => {
    expect(read("app/api/me/stores/[storeId]/finance/transparent/route.ts")).toContain("loadAdFundingTraces(");
    const sql = read("supabase/migrations/20270601120100_r7_admin_finance_pages.sql");
    for (const fn of ["admin_finance_unified_tx_page", "admin_finance_store_activity_page", "admin_finance_ad_funding_page"]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`));
    }
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b\s+(INTO|public\.|FROM)/i);
  });

  it("주문 ID 필터는 포인트 원장에도 걸린다 (실측 F1 — 주문과 무관한 포인트 행 제외)", () => {
    const sql = read("supabase/migrations/20270601172000_r7_finance_tx_order_filter_partial.sql");
    const coinBranch = sql.slice(sql.indexOf("FROM public.store_economic_point_ledger s"), sql.indexOf("FROM public.point_ledger p"));
    const pointBranch = sql.slice(sql.indexOf("FROM public.point_ledger p"));
    // 주문 UUID 앞자리로도 현금·Coin·포인트 세 원장이 같은 부분 일치 (재실측 F1′ — Coin 적립 행 누락)
    expect(sql).toContain("strpos(lower(b.related_id), lower(p_order_id)) > 0");
    expect(coinBranch).toContain("OR strpos(lower(s.related_id), lower(p_order_id)) > 0");
    expect(coinBranch).toContain("OR strpos(lower(s.idempotency_key), lower('sale_coin:' || p_order_id)) > 0");
    expect(pointBranch).toContain("AND (coalesce(p_order_id, '') = '' OR strpos(lower(p.related_id), lower(p_order_id)) > 0)");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_finance_unified_tx_page\([^)]*\) TO service_role/);
  });
});
