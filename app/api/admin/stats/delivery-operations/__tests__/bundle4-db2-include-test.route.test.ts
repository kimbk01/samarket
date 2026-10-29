/**
 * 묶음 4 · S-12 / DB-2 — 관리자 배달 통계: 기본 = 실매장만, 「테스트 포함 보기」(`?include_test=1`) = 전 매장.
 * SQL 집계는 `p_include_test` 인자로, 수수료 SSOT 조회는 실매장 id 목록(`storeIds`)으로 같은 범위를 적용한다
 * (SSOT 함수 자체는 바꾸지 않는다). 실시간 상황판은 처리 큐라 기존 전 매장 집계 유지.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcCalls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
const breakdown = vi.fn(async (..._a: unknown[]) => [{ netCommissionMinor: 1200 }]);
const payable = vi.fn(async (..._a: unknown[]) => ({ summary: { payablePhp: 7 } }));
let realStoreIds: string[] | null = ["r1", "r2"];

vi.mock("@/lib/admin/require-admin-api", () => ({ requireAdminApiUser: async () => ({ ok: true, userId: "a" }) }));
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: name === "admin_delivery_operations_dashboard" ? { kpis: { orders_today: 0 } } : {}, error: null };
    },
  }),
}));
vi.mock("@/lib/stores/commission/load-store-commission-ledger", () => ({
  loadStoreCommissionBreakdown: (...a: unknown[]) => breakdown(...a),
  loadStorePlatformPayable: (...a: unknown[]) => payable(...a),
}));
vi.mock("@/lib/admin/metrics/admin-store-kind-scope", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, loadAdminRealStoreIds: async () => realStoreIds };
});

import { GET } from "@/app/api/admin/stats/delivery-operations/route";
import { parseAdminIncludeTestStores } from "@/lib/admin/metrics/admin-store-kind-scope";
import { adminDeliveryOperationsStatsCacheKey } from "@/lib/admin/fetch-admin-delivery-operations-deduped";

const get = (qs: string) => GET(new Request(`http://localhost/api/admin/stats/delivery-operations?${qs}`));
const dashArgs = () => rpcCalls.find((c) => c.name === "admin_delivery_operations_dashboard")?.args ?? {};

beforeEach(() => {
  rpcCalls.length = 0;
  breakdown.mockClear();
  payable.mockClear();
  realStoreIds = ["r1", "r2"];
});

describe("DB-2 관리자 배달 통계 매장 유형 범위", () => {
  it("기본 = 실매장만: p_include_test=false, SSOT 조회는 실매장 id 목록", async () => {
    const res = await get("days=7");
    const body = (await res.json()) as { kpis: Record<string, unknown>; query: { include_test: boolean } };
    expect(res.status).toBe(200);
    expect(dashArgs().p_include_test).toBe(false);
    expect((breakdown.mock.calls[0]![1] as { storeIds: unknown }).storeIds).toEqual(["r1", "r2"]);
    expect((payable.mock.calls[0]![1] as { storeIds: unknown }).storeIds).toEqual(["r1", "r2"]);
    expect(body.query.include_test).toBe(false);
    expect(body.kpis.platform_revenue_today).toBe(12);
  });

  it("테스트 포함 보기: p_include_test=true, SSOT 조회는 전 매장(null) — 기존 집계", async () => {
    const res = await get("days=7&include_test=1");
    const body = (await res.json()) as { query: { include_test: boolean } };
    expect(dashArgs().p_include_test).toBe(true);
    expect((breakdown.mock.calls[0]![1] as { storeIds: unknown }).storeIds).toBeNull();
    expect(body.query.include_test).toBe(true);
  });

  it("실매장 0곳이면 금액 KPI 0 (SSOT 미호출)", async () => {
    realStoreIds = [];
    const body = (await (await get("days=7")).json()) as { kpis: Record<string, unknown> };
    expect(breakdown).not.toHaveBeenCalled();
    expect(body.kpis.platform_revenue_today).toBe(0);
    expect(body.kpis.settlement_pending_amount_today).toBe(0);
  });

  it("실매장 목록 조회 실패 = 금액 KPI 확인 불가(null), 전 매장 값으로 대체하지 않음", async () => {
    realStoreIds = null;
    const body = (await (await get("days=7")).json()) as { kpis: Record<string, unknown> };
    expect(breakdown).not.toHaveBeenCalled();
    expect(body.kpis.platform_revenue_today).toBeNull();
  });

  it("토글 파싱·캐시 키 분리", () => {
    expect(parseAdminIncludeTestStores("1")).toBe(true);
    expect(parseAdminIncludeTestStores("true")).toBe(true);
    expect(parseAdminIncludeTestStores(null)).toBe(false);
    expect(parseAdminIncludeTestStores("0")).toBe(false);
    expect(adminDeliveryOperationsStatsCacheKey(14)).not.toBe(adminDeliveryOperationsStatsCacheKey(14, true));
  });
});

describe("DB-2 마이그레이션·호출 계약", () => {
  const root = process.cwd();
  const sql = readFileSync(
    join(root, "supabase/migrations/20270708140200_admin_delivery_ops_dashboard_real_store_scope_db2.sql"),
    "utf8"
  );
  const active = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("4개 인자 함수를 DROP 하고 p_include_test DEFAULT false 5개 인자로 교체 · service_role 만 실행", () => {
    expect(active).toMatch(
      /DROP FUNCTION IF EXISTS public\.admin_delivery_operations_dashboard\(timestamptz, timestamptz, timestamptz, timestamptz\);/
    );
    expect(active).toContain("p_include_test boolean DEFAULT false");
    expect(active).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_delivery_operations_dashboard\([^)]*boolean\) TO service_role/);
  });

  it("모든 주문·정산·배송 참조가 실매장 범위 서브쿼리 (원 테이블 직접 참조 0)", () => {
    expect(active).not.toMatch(/public\.store_orders so\b/);
    expect(active).not.toMatch(/public\.store_settlements ss\b/);
    expect(active).not.toMatch(/public\.store_order_deliveries sod\b/);
    expect((active.match(/store_kind = 'real'/g) ?? []).length).toBeGreaterThanOrEqual(26);
  });

  it("수수료·정산 SSOT 함수는 정의하지 않는다", () => {
    expect(active).not.toMatch(/FUNCTION public\.(store_commission|settlement|admin_decide_store_commission_adjustment|store_platform_payable)/i);
  });

  it("실시간 상황판은 p_include_test=true 로 기존 집계 유지", () => {
    const src = readFileSync(join(root, "app/api/admin/ops-console/summary/route.ts"), "utf8");
    expect(src).toMatch(/admin_delivery_operations_dashboard[\s\S]{0,400}p_include_test: true/);
  });
});
