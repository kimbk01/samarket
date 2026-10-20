import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { makeFakeSupabase } from "@/lib/admin/__tests__/r7-delivery-b-fake-supabase";

/**
 * R7 쿠폰 관리 — 캠페인 목록 서버 페이지 계약.
 * limit/offset·필터 → DB 함수 인자, total·KPI·최근 처리는 DB 값, 캠페인 표시값은 쪽 id 만 읽고 DB 집계로 덮어쓴다.
 */
const isRouteAdmin = vi.fn(async () => true);
const tryGetSupabaseForStores = vi.fn();
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: () => isRouteAdmin() }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => tryGetSupabaseForStores() }));

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const STORE = "33333333-3333-4333-8333-333333333333";

function campaign(id: string, created: string) {
  return {
    id,
    store_id: STORE,
    title: `T-${id.slice(0, 1)}`,
    discount_type: "fixed_amount",
    discount_value: 50,
    lifecycle_state: "active",
    funding_mode: "STORE_FUNDED",
    is_active: true,
    issued_count: 3,
    issue_limit: 10,
    reserved_spend_php: 0,
    start_at: "2026-01-01T00:00:00Z",
    end_at: "2027-01-01T00:00:00Z",
    created_at: created,
  };
}

function fixture() {
  return makeFakeSupabase(
    {
      store_coupon_campaigns: [campaign(C1, "2026-05-01T00:00:00Z"), campaign(C2, "2026-05-02T00:00:00Z")],
      stores: [{ id: STORE, store_name: "Pasta", slug: "pasta" }],
      // 메모리 계산이면 claimed=1 — DB 집계(1500)가 이겨야 한다
      coupon_user_entitlements: [
        { id: "e1", campaign_id: C1, buyer_user_id: "u1", status: "available", created_at: "2026-05-03T00:00:00Z", expires_at: "2099-01-01T00:00:00Z" },
      ],
      store_coupon_redemptions: [],
      coupon_audit_events: [],
      profiles: [],
    },
    (name, args) => {
      if (name !== "admin_store_coupon_campaign_page") return { data: null, error: { message: "unknown" } };
      return {
        data: {
          total: 260,
          limit: args.p_limit,
          offset: args.p_offset,
          // DB 정렬 순서 (C1 → C2) 를 그대로 유지해야 한다
          rows: [
            { id: C1, claimed: 1500, redeemed: 250, active_held: 625, expired: 375, revoked: 250, customer_discount: 150, store_funded: 41, platform_funded: 110, order_sales_php: 1650 },
            { id: C2, claimed: 0, redeemed: 0, active_held: 0, expired: 0, revoked: 0, customer_discount: 0, store_funded: 0, platform_funded: 0, order_sales_php: 0 },
          ],
          kpi: { total: 260, active: 115, waiting: 58, ended: 87 },
          stores: [{ id: STORE, name: "Pasta" }],
          recent: [{ created_at: "2026-06-01T00:00:00Z", title: "C2", actor_label: null, action: "admin_approve" }],
        },
        error: null,
      };
    }
  );
}

async function get(path: string) {
  const { GET } = await import("@/app/api/admin/store-coupons/route");
  const res = await GET(new NextRequest(`https://samarket.vercel.app${path}`));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 응답 JSON 단언용
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

describe("R7 /api/admin/store-coupons server page", () => {
  beforeEach(() => {
    vi.resetModules();
    tryGetSupabaseForStores.mockReset();
  });

  it("limit/offset/filters → RPC args (page size capped at 100), total/KPI/stores/recent from DB", async () => {
    const f = fixture();
    tryGetSupabaseForStores.mockReturnValue(f.sb);
    const { status, json } = await get(
      `/api/admin/store-coupons?limit=500&offset=40&status=waiting&funding=PLATFORM_FUNDED&store_id=${STORE}`
    );
    expect(status).toBe(200);
    expect(f.rpcCalls).toEqual([
      {
        name: "admin_store_coupon_campaign_page",
        args: {
          p_status: "waiting",
          p_funding: "PLATFORM_FUNDED",
          p_store_id: STORE,
          p_campaign_id: null,
          p_limit: 100,
          p_offset: 40,
        },
      },
    ]);
    expect(json.total).toBe(260);
    expect(json.limit).toBe(100);
    expect(json.offset).toBe(40);
    expect(json.kpi).toEqual({ total: 260, active: 115, waiting: 58, ended: 87 });
    expect(json.stores).toEqual([{ id: STORE, name: "Pasta" }]);
    expect(json.recent).toHaveLength(1);
    // 쪽 캠페인만 id 로 읽고, DB 순서 유지
    expect(json.campaigns.map((c: { id: string }) => c.id)).toEqual([C1, C2]);
    const campaignRead = f.calls.find((c) => c.table === "store_coupon_campaigns")!;
    expect(campaignRead.ops).toContainEqual(["in", ["id", [C1, C2]]]);
    // 고정 상한 없음 (기존 limit(200) 경로를 타지 않는다)
    expect(f.limitCalls().filter((l) => l.table === "store_coupon_campaigns")).toEqual([]);
  });

  it("DB aggregates override in-memory counts / realized / sales", async () => {
    const f = fixture();
    tryGetSupabaseForStores.mockReturnValue(f.sb);
    const { json } = await get("/api/admin/store-coupons?limit=20&offset=0");
    const c1 = json.campaigns[0];
    expect(c1.claimed_count).toBe(1500);
    expect(c1.redeemed_count).toBe(250);
    expect(c1.active_held_count).toBe(625);
    expect(c1.expired_count).toBe(375);
    expect(c1.revoked_count).toBe(250);
    expect(c1.realized).toEqual({ customer_discount: 150, store_funded: 41, platform_funded: 110 });
    expect(c1.order_sales_php).toBe(1650);
    expect(c1.issued_reconciliation).toEqual({ issued_count: 3, entitlement_count: 1500, consistent: false });
  });

  it("campaignId deep link → same RPC with p_campaign_id (no 200-row list needed)", async () => {
    const f = fixture();
    tryGetSupabaseForStores.mockReturnValue(f.sb);
    await get(`/api/admin/store-coupons?campaignId=${C1}`);
    expect(f.rpcCalls[0]?.args).toMatchObject({ p_campaign_id: C1, p_limit: 1, p_offset: 0 });
  });

  it("legacy callers keep the old response: no params / couponNumber → no RPC, campaigns array", async () => {
    const f = fixture();
    tryGetSupabaseForStores.mockReturnValue(f.sb);
    const { json } = await get("/api/admin/store-coupons");
    expect(f.rpcCalls).toEqual([]);
    expect(Array.isArray(json.campaigns)).toBe(true);
    expect(json.writer).toBe("admin_http");
    expect(json.total).toBeUndefined();
  });

  it("page client asks the server for pages (no client-side slice of a capped list)", () => {
    const page = readFileSync(resolve(process.cwd(), "components/admin/stores/AdminStoreCouponControlPage.tsx"), "utf8");
    expect(page).toContain("/api/admin/store-coupons?${listApiQuery}");
    expect(page).toContain("campaignId=${encodeURIComponent(campaignId)}");
    expect(page).not.toContain("summarizeAdminCouponDashboardKpi(campaigns)");
    const list = readFileSync(resolve(process.cwd(), "components/admin/stores/AdminStoreCouponControlList.tsx"), "utf8");
    expect(list).toContain("<AdminPagination");
    expect(list).not.toContain("paginateAdminCouponListRows");
    const mig = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20270601140000_r7_admin_store_coupon_campaign_page.sql"),
      "utf8"
    );
    expect(mig).toContain("SECURITY DEFINER");
    expect(mig).toMatch(/REVOKE ALL ON FUNCTION public\.admin_store_coupon_campaign_page\([^)]*\)\s*FROM PUBLIC, anon, authenticated/);
    expect(mig).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_store_coupon_campaign_page\([^)]*\)\s*TO service_role/);
  });
});
