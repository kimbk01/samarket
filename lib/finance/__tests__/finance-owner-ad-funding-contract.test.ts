/**
 * R7 후속(funding) — 사장님 재무 「광고 자금」 계약 (가짜 DB).
 * GET /api/me/stores/[storeId]/finance/transparent?kind=ad-funding
 * - 예전: `loadAdFundingTraces` 가 운영에 없는 열(`delivery_ad_canonical_bc_fundings.owner_user_id` 등)을 직접 조회 →
 *   PostgREST 오류가 무시되어 항상 빈 목록.
 * - 지금: 관리자 「광고 지출」과 같은 정의 RPC `admin_finance_ad_funding_page` 한 번
 *   (p_store_id = 권한 확인된 자기 매장 · p_rail = STORE_CASH) + 같은 행 변환. 출처 테이블 직접 조회 없음.
 * - 권한: getStoreIfOwner 실패 시 RPC 호출 없음. 응답 모양 `{ ok, traces }` 유지. 조회 실패는 빈 목록이 아니라 500.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Call = { kind: "rpc" | "from"; name: string; args?: unknown };
const calls: Call[] = [];
let rpcResult: { data: unknown; error: { message: string } | null } = { data: { total: 0, rows: [] }, error: null };

const fakeSb = {
  rpc: (name: string, args: unknown) => {
    calls.push({ kind: "rpc", name, args });
    return Promise.resolve(rpcResult);
  },
  from: (name: string) => {
    calls.push({ kind: "from", name });
    throw new Error(`unexpected table read: ${name}`);
  },
};

const STORE = "11111111-1111-1111-1111-111111111111";
const OTHER_STORE = "33333333-3333-3333-3333-333333333333";
let gateOk = true;

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true }) }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fakeSb }));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async (_sb: unknown, _uid: string, sid: string) =>
    gateOk && sid === STORE ? { ok: true, store: { id: sid } } : { ok: false, error: "forbidden", status: 403 },
}));
vi.mock("@/lib/finance/order-money-chain/load-order-money-chain", () => ({ loadOrderMoneyChain: vi.fn() }));
vi.mock("@/lib/finance/store-statement/load-store-statement", () => ({ loadStoreStatement: vi.fn() }));
vi.mock("@/lib/admin/store-financial-statement/load-store-financial-statement", () => ({
  resolveStoreFinancialPeriod: () => ({ fromIso: null, toIso: null }),
}));

import { GET } from "@/app/api/me/stores/[storeId]/finance/transparent/route";
import { ADMIN_FINANCE_AD_FUNDING_PAGE_RPC } from "@/lib/finance/ad-funding-trace/load-ad-funding-trace-page";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const call = (sid: string, qs = "kind=ad-funding") =>
  GET(new NextRequest(`https://x.test/api/me/stores/${sid}/finance/transparent?${qs}`), {
    params: Promise.resolve({ storeId: sid }),
  });

beforeEach(() => {
  calls.length = 0;
  gateOk = true;
  rpcResult = { data: { total: 0, rows: [] }, error: null };
});

describe("사장님 재무 광고 자금 — 관리자와 같은 RPC 정의", () => {
  it("자기 매장 STORE_CASH 만 RPC 한 번 · 운영 열(stores.owner_user_id) 기준 행 변환 · 응답 `{ ok, traces }`", async () => {
    rpcResult = {
      data: {
        total: 13,
        rows: [
          {
            source: "delivery_ad_canonical_bc_fundings",
            id: "f1",
            row: {
              id: "f1",
              application_id: "app-1",
              store_id: STORE,
              owner_user_id: "owner-1",
              product_kind: "banner",
              status: "secured",
              amount_minor: 25000,
              spend_ledger_id: "led-1",
              refund_ledger_id: null,
            },
          },
        ],
      },
      error: null,
    };
    const res = await call(STORE, "kind=ad-funding&limit=40");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; traces: Record<string, unknown>[] };
    expect(Object.keys(json).sort()).toEqual(["ok", "traces"]);
    expect(json.ok).toBe(true);
    expect(json.traces).toHaveLength(1);
    expect(json.traces[0]).toMatchObject({
      adId: "app-1",
      fundingRail: "STORE_CASH",
      walletType: "CASH",
      storeId: STORE,
      ownerId: "owner-1",
      priceMinor: 25000,
      price: 250,
      fundingTransactionId: "led-1",
      source: "delivery_ad_canonical_bc_fundings",
    });
    expect(calls).toEqual([
      {
        kind: "rpc",
        name: ADMIN_FINANCE_AD_FUNDING_PAGE_RPC,
        args: { p_store_id: STORE, p_member_id: null, p_rail: "STORE_CASH", p_limit: 40, p_offset: 0 },
      },
    ]);
  });

  it("limit 상한 100 · 기본 40", async () => {
    await call(STORE, "kind=ad-funding&limit=999");
    await call(STORE, "kind=ad-funding");
    expect(calls.map((c) => (c.args as { p_limit: number }).p_limit)).toEqual([100, 40]);
  });

  it("남의 매장은 권한 거부 — RPC 호출 없음", async () => {
    const res = await call(OTHER_STORE);
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("조회 실패는 빈 목록으로 덮지 않고 500", async () => {
    rpcResult = { data: null, error: { message: "column does not exist" } };
    const res = await call(STORE);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "ad_funding_load_failed" });
  });

  it("로더는 출처 테이블을 직접 조회하지 않는다 (운영에 없는 열 선택 제거)", () => {
    const src = read("lib/finance/ad-funding-trace/load-ad-funding-trace.ts");
    expect(src).toContain("loadAdFundingTracePage(");
    expect(src).not.toMatch(/\.from\(/);
    expect(src).not.toMatch(/\.select\(/);
  });
});
