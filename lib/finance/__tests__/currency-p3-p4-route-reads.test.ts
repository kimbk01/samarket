import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 4단계 P-3·P-4 (설계 docs/audit/currency-remaining-defects-design-2026-11-04.md §4)
 * — 화면이 쓰지 않는 조회를 라우트가 더 이상 하지 않는지 (호출 여부·읽는 표).
 */

const tablesRead: string[] = [];
const rpcCalls: string[] = [];
const limits: Array<{ table: string; n: number }> = [];

function fakeSb(profilePoints = 120) {
  return {
    rpc: vi.fn(async (name: string) => {
      rpcCalls.push(name);
      return { data: 0, error: null };
    }),
    from: (table: string) => {
      tablesRead.push(table);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "range", "gt", "lt", "not", "is", "in", "or", "gte", "lte"]) {
        q[m] = () => q;
      }
      q.limit = (n: number) => {
        limits.push({ table, n });
        return q;
      };
      q.maybeSingle = async () =>
        table === "profiles" ? { data: { points: profilePoints, nickname: "n" }, error: null } : { data: null, error: null };
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 });
      return q;
    },
  };
}

const writer = vi.hoisted(() => ({
  buildOwnerConversionDisclosure: vi.fn(async () => ({ ok: true, quote: { ratePesosPerPoint: 1, version: 3 } })),
  listBusinessCashLedgerForStore: vi.fn(async () => []),
  listEconomicPointLedgerForStore: vi.fn(async () => []),
  loadBusinessCashChargePolicy: vi.fn(async () => ({ paymentMethods: ["gcash"] })),
  loadStoreBusinessCashBalance: vi.fn(async () => ({ balanceMinor: 500, currency: "PHP" })),
  loadStoreEconomicPointsBalance: vi.fn(async () => ({ balance: 7 })),
  createBusinessCashTopUpRequest: vi.fn(),
  convertStorePointsToBusinessCash: vi.fn(),
}));
vi.mock("@/lib/stores/advertising/canonical-business-cash-writer", () => writer);
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "u1" }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true }) }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fakeSb() }));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async () => ({ ok: true }),
  getStoreIfOwnerForOperationalWrite: async () => ({ ok: true }),
}));
vi.mock("@/lib/stores/owner-finance-recent-window", () => ({
  loadOpenSaleFeeTotalsFromCashPosition: async () => ({ ok: true, outstandingMinor: 0, openCount: 0 }),
}));

const pointHistory = vi.hoisted(() => ({
  loadPointFinancialSummary: vi.fn(),
  loadPointFinancialHistory: vi.fn(async () => ({
    ok: true,
    page: { items: [], hasMore: false, nextCursor: null, total: 0 },
  })),
  loadPointFinancialHistoryChainPage: vi.fn(),
  serializePointFinancialPage: (page: { items: unknown[] }) => ({ items: page.items, hasMore: false, nextCursor: null, total: 0 }),
}));
vi.mock("@/lib/points/project-point-financial-history", () => pointHistory);
vi.mock("@/lib/points/point-period-history", async (orig) => ({
  ...(await orig<typeof import("@/lib/points/point-period-history")>()),
  loadPointHistoryPeriodExtras: async () => ({ ok: true, extras: { chargeRequests: [] } }),
}));
vi.mock("@/lib/auth/api-session", () => ({ requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }) }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => fakeSb(-38) }));

const ctx = { params: Promise.resolve({ storeId: "s1" }) };

beforeEach(() => {
  tablesRead.length = 0;
  rpcCalls.length = 0;
  limits.length = 0;
  vi.clearAllMocks();
});

describe("P-3 사장님 /finance — 전환 미리보기·충전 20건 조회 제거", () => {
  it("전환 미리보기를 계산하지 않고 충전 신청 표를 읽지 않으며, 응답에 conversion·topUpRequests 가 없다", async () => {
    const { GET } = await import("@/app/api/me/stores/[storeId]/finance/route");
    const res = await GET(new NextRequest("http://localhost/api/me/stores/s1/finance"), ctx);
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(writer.buildOwnerConversionDisclosure).not.toHaveBeenCalled();
    expect(tablesRead).not.toContain("business_cash_charge_requests");
    expect(json).not.toHaveProperty("conversion");
    expect(json).not.toHaveProperty("topUpRequests");
    // 화면이 쓰는 값은 그대로
    expect(json.assets).toMatchObject({ storePoints: { balance: 7 }, businessCash: { balanceMinor: 500 } });
    expect(json).toHaveProperty("saleFeeObligations");
  });
});

describe("P-3 사장님 /business-cash — 원장 2종 조회 제거", () => {
  it("Cash·Coin 원장을 읽지 않고 응답에 businessCashLedger·storePointsLedger 가 없다 (전환 정보는 유지)", async () => {
    const { GET } = await import("@/app/api/me/stores/[storeId]/business-cash/route");
    const res = await GET(new NextRequest("http://localhost/api/me/stores/s1/business-cash"), ctx);
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(writer.listBusinessCashLedgerForStore).not.toHaveBeenCalled();
    expect(writer.listEconomicPointLedgerForStore).not.toHaveBeenCalled();
    expect(json).not.toHaveProperty("businessCashLedger");
    expect(json).not.toHaveProperty("storePointsLedger");
    expect(writer.buildOwnerConversionDisclosure).toHaveBeenCalledTimes(1);
    expect(json.conversion).toMatchObject({ version: 3 });
    expect(json).toHaveProperty("topUpRequests");
    expect(json).toHaveProperty("topUpPolicy");
  });
});

describe("P-4 회원 /api/me/points — 잔액만 읽음", () => {
  it("누적 합계(원장 5천 줄·원장 합 RPC)를 계산하지 않고 잔액은 그대로 (음수 포함)", async () => {
    const { GET } = await import("@/app/api/me/points/route");
    const res = await GET(new NextRequest("http://localhost/api/me/points"));
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(pointHistory.loadPointFinancialSummary).not.toHaveBeenCalled();
    expect(rpcCalls).not.toContain("sum_user_point_ledger");
    expect(limits.filter((l) => l.table === "point_ledger" && l.n === 5000)).toEqual([]);
    expect(json.balance).toBe(-38);
    expect(json).not.toHaveProperty("summary");
  });
});
