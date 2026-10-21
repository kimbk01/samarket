import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeFakeSupabase } from "@/lib/admin/__tests__/r7-delivery-b-fake-supabase";

/**
 * R7 수수료 정책 개요 — 매장 수 집계는 DB 요약 함수(전체 매장), 매장 목록은 `?section=stores` 서버 페이지.
 * 매장 2000·정책 500 고정 상한 경로가 없어야 한다. 유효 정책 = SSOT store_commission_resolve_policy (DB 함수 안).
 */
const isRouteAdmin = vi.fn(async () => true);
const tryGetSupabaseForStores = vi.fn();
const requireAdminApiActor = vi.fn(async () => ({ ok: true, actor: { isSuperAdmin: true } }));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: () => isRouteAdmin() }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => tryGetSupabaseForStores() }));
vi.mock("@/lib/admin/require-admin-permission", () => ({ requireAdminApiActor: () => requireAdminApiActor() }));

const CAT = "c0000000-0000-4000-8000-000000000001";
const TOPIC = "d0000000-0000-4000-8000-000000000001";
const STORE_A = "e0000000-0000-4000-8000-000000000001";

function fixture() {
  return makeFakeSupabase(
    {
      store_fee_policies: [
        { id: "p-default", policy_name: "Default", store_id: null, category_id: null, topic_id: null, fee_percent: 10, fixed_fee: 0, is_active: true, is_archived: false, starts_at: null, ends_at: null, priority: 100, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
        { id: "p-cat", policy_name: "Food", store_id: null, category_id: CAT, topic_id: null, fee_percent: 8, fixed_fee: 0, is_active: true, is_archived: false, starts_at: null, ends_at: null, priority: 50, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
      ],
      store_categories: [{ id: CAT, name: "Food", slug: "food", is_active: true }],
      store_topics: [{ id: TOPIC, name: "Chicken", slug: "chicken", store_category_id: CAT, is_active: true }],
      stores: [],
      store_settlements: [{ id: "legacy-1", store_id: STORE_A, gross_amount: 999, platform_fee_amount: 1 }],
      store_sale_fee_obligations: [
        {
          id: "ob-ok",
          store_id: STORE_A,
          order_id: "o-ok",
          confirmed_revenue_php: 950,
          fee_due_minor: 6600,
          original_fee_due_minor: 6600,
          status: "settled",
          created_at: "2026-10-20T00:00:00Z",
          fee_snapshot: {
            policy_id: "p-cat",
            policy: { fee_percent: 7, fixed_fee: 0, delivery_fee_mode: "none", delivery_fee_percent: 0 },
            commission_base_php: 950,
            delivery_fee_php: 50,
            fee_percent: 7,
            platform_fee_php: 66,
            fixed_fee_php: 0,
            delivery_income_php: 0,
            fee_due_php: 66,
          },
        },
        {
          id: "ob-bad",
          store_id: STORE_A,
          order_id: "o-bad",
          confirmed_revenue_php: 1000,
          fee_due_minor: 9000,
          original_fee_due_minor: 9000,
          status: "open",
          created_at: "2026-10-19T00:00:00Z",
          fee_snapshot: {
            policy_id: "p-cat",
            policy: { fee_percent: 8, fixed_fee: 0, delivery_fee_mode: "none", delivery_fee_percent: 0 },
            commission_base_php: 1000,
            delivery_fee_php: 0,
            fee_percent: 8,
            platform_fee_php: 90,
            fixed_fee_php: 0,
            delivery_income_php: 0,
            fee_due_php: 90,
          },
        },
      ],
    },
    (name, args) => {
      if (name === "admin_store_fee_overview_summary") {
        return {
          data: {
            stores_total: 2300,
            applied_default: 1135,
            applied_category: 568,
            applied_topic: 567,
            applied_store: 30,
            missing_policy: 0,
            reserved_future: 2,
            inactive_policies: 1,
            categories: { [CAT]: { store_count: 575, override_store_count: 7, topic_wins_store_count: 0 } },
            topics: { [TOPIC]: { store_count: 575, override_store_count: 7 } },
          },
          error: null,
        };
      }
      if (name === "admin_store_fee_store_page") {
        return {
          data: {
            total: 2300,
            limit: args.p_limit,
            offset: args.p_offset,
            rows: [
              {
                store_id: STORE_A,
                store_name: "Shop 01",
                slug: "shop-01",
                category_id: CAT,
                category_name: "Food",
                topic_id: TOPIC,
                topic_name: "Chicken",
                effective: { policy_id: "p-cat", policy_name: "Food", fee_percent: 8, fixed_fee: 0, scope: "category" },
                store_policy: null,
                topic_policy: null,
                category_policy: { policy_id: "p-cat", policy_name: "Food", fee_percent: 8, fixed_fee: 0, updated_at: "2026-01-02T00:00:00Z" },
              },
              {
                store_id: "e0000000-0000-4000-8000-000000000002",
                store_name: "Shop 02",
                slug: "shop-02",
                category_id: null,
                category_name: null,
                topic_id: null,
                topic_name: null,
                effective: null,
                store_policy: null,
                topic_policy: null,
                category_policy: null,
              },
            ],
          },
          error: null,
        };
      }
      if (name === "admin_store_fee_active_policy_json") {
        return { data: { policy_id: "p-default", policy_name: "Default", fee_percent: 10, fixed_fee: 0 }, error: null };
      }
      return { data: null, error: { message: "unknown rpc" } };
    }
  );
}

async function get(path: string) {
  const { GET } = await import("@/app/api/admin/store-fee-policies/overview/route");
  const res = await GET(new Request(`https://samarket.vercel.app${path}`));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 응답 JSON 단언용
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

describe("R7 /api/admin/store-fee-policies/overview", () => {
  beforeEach(() => {
    vi.resetModules();
    tryGetSupabaseForStores.mockReset();
  });

  it("overview summary counts come from the DB summary over all stores (no 2000/500 caps)", async () => {
    const f = fixture();
    tryGetSupabaseForStores.mockReturnValue(f.sb);
    const { status, json } = await get("/api/admin/store-fee-policies/overview");
    expect(status).toBe(200);
    expect(f.rpcCalls.map((c) => c.name)).toContain("admin_store_fee_overview_summary");
    expect(json.summary).toMatchObject({
      stores_total: 2300,
      applied_default: 1135,
      applied_category: 568,
      applied_topic: 567,
      applied_business: 1135,
      applied_store: 30,
      missing_policy: 0,
      reserved_future: 2,
      inactive_policies: 1,
    });
    expect(json.categories[0]).toMatchObject({
      category_id: CAT,
      store_count: 575,
      override_store_count: 7,
      topic_wins_store_count: 0,
      would_apply_store_count: 568,
    });
    expect(json.topics[0]).toMatchObject({ topic_id: TOPIC, store_count: 575, would_apply_store_count: 568 });
    expect(json.viewer).toEqual({ can_edit_fee_policy: true });
    expect(json.stores).toEqual([]);
    // 고정 상한: 표시용 최근 변경 60 · 검증 표본 80 만 남는다 (매장·정책·업종 전수 읽기에는 limit 없음)
    const limits = f.limitCalls();
    expect(limits).toEqual(
      expect.arrayContaining([
        { table: "store_fee_policies", n: 60 },
        { table: "store_sale_fee_obligations", n: 80 },
      ])
    );
    expect(limits.some((l) => l.n === 2000 || l.n === 500 || l.n === 300 || (l.table === "store_categories" && l.n === 100))).toBe(false);
    expect(f.calls.some((c) => c.table === "stores" && c.ops.every(([op]) => op !== "in"))).toBe(false);
  });

  it("FIN-07: verification sample = charged obligations (fee_snapshot), never legacy store_settlements", async () => {
    const f = fixture();
    tryGetSupabaseForStores.mockReturnValue(f.sb);
    const { status, json } = await get("/api/admin/store-fee-policies/overview");
    expect(status).toBe(200);
    expect(f.calls.some((c) => c.table === "store_settlements")).toBe(false);
    const obl = f.calls.find((c) => c.table === "store_sale_fee_obligations");
    expect(obl?.ops).toEqual(expect.arrayContaining([["not", ["fee_snapshot", "is", null]]]));
    expect(json.verification_source).toBe("store_sale_fee_obligations.fee_snapshot");
    expect(json.verification).toHaveLength(2);
    expect(json.verification[0]).toMatchObject({
      settlement_id: "ob-ok",
      gross_amount: 950,
      policy_fee_percent: 7,
      settlement_fee_percent: 7,
      calculated_fee_amount: 66,
      settlement_fee_amount: 66,
      matched: true,
    });
    // floor(1000 * 8%) = 80 but 90 was charged -> mismatch is surfaced
    expect(json.verification[1]).toMatchObject({ settlement_id: "ob-bad", calculated_fee_amount: 80, settlement_fee_amount: 90, matched: false });
    expect(json.summary.verification_mismatch).toBe(1);
  });

  it("?section=stores → RPC args (q, category, limit ≤ 100, offset), exact total, ladder + missing policy", async () => {
    const f = fixture();
    tryGetSupabaseForStores.mockReturnValue(f.sb);
    const { json } = await get(
      `/api/admin/store-fee-policies/overview?section=stores&q=shop&cat=${CAT}&limit=1000&offset=40`
    );
    const pageCall = f.rpcCalls.find((c) => c.name === "admin_store_fee_store_page");
    expect(pageCall?.args).toEqual({ p_q: "shop", p_category_id: CAT, p_limit: 100, p_offset: 40 });
    expect(json.total).toBe(2300);
    expect(json.limit).toBe(100);
    expect(json.offset).toBe(40);
    expect(json.stores[0]).toMatchObject({
      store_id: STORE_A,
      has_store_override: false,
      effective: { fee_percent: 8, scope: "category", policy_id: "p-cat", missing: false },
      ladder: { category: { policy_id: "p-cat", fee_percent: 8 }, platform: { policy_id: "p-default" } },
    });
    expect(json.stores[1].effective).toMatchObject({ scope: "missing_policy", missing: true });
    // 매장 탭은 요약 함수를 다시 부르지 않는다
    expect(f.rpcCalls.map((c) => c.name)).not.toContain("admin_store_fee_overview_summary");
  });

  it("invalid category id is ignored, page defaults to 20", async () => {
    const f = fixture();
    tryGetSupabaseForStores.mockReturnValue(f.sb);
    await get("/api/admin/store-fee-policies/overview?section=stores&cat=not-a-uuid");
    expect(f.rpcCalls.find((c) => c.name === "admin_store_fee_store_page")?.args).toEqual({
      p_q: null,
      p_category_id: null,
      p_limit: 20,
      p_offset: 0,
    });
  });

  it("client: store tab uses the server page; migration keeps SSOT resolver + service_role only", () => {
    const page = readFileSync(resolve(process.cwd(), "components/admin/stores/AdminStoreFeePoliciesPage.tsx"), "utf8");
    expect(page).toContain("/api/admin/store-fee-policies/overview?section=stores&${storeApiQuery}");
    expect(page).toContain("<AdminPagination");
    expect(page).not.toContain("overview?.stores");
    const mig = readFileSync(resolve(process.cwd(), "supabase/migrations/20270601141000_r7_admin_store_fee_overview.sql"), "utf8");
    expect(mig).toContain("public.store_commission_resolve_policy(s.id)");
    expect(mig).toContain("public.store_commission_resolve_policy(pg.id)");
    for (const fn of ["admin_store_fee_overview_summary", "admin_store_fee_store_page", "admin_store_fee_active_policy_json"]) {
      expect(mig).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`));
      expect(mig).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`));
    }
  });
});
