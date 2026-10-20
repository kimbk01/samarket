import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { makeFakeSupabase } from "@/lib/admin/__tests__/r7-delivery-b-fake-supabase";

/**
 * R7 상품권 매출 — 합계는 DB `admin_gift_revenue_page` (전체 원장), 상세 행은 서버 페이지 (limit/offset/total).
 * 5000건 원장·잔액·매장 캐시 상한과 화면 slice(0, 200) 이 없어야 한다.
 */
const requireAdminPermission = vi.fn();
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (key: string) => requireAdminPermission(key),
}));

const R1 = "b0000000-0000-4000-8000-000000000001";
const R2 = "b0000000-0000-4000-8000-000000000002";
const PRODUCT = "a0000000-0000-4000-8000-000000000001";

function fixture() {
  const redemption = (id: string, created: string) => ({
    id,
    order_id: `o-${id.slice(-1)}`,
    instance_id: "i1",
    store_id: "s1",
    redeemed_amount: 100,
    platform_fee_amount: 10,
    merchant_net_amount: 90,
    platform_fee_rate_snapshot: 10,
    reversed: false,
    created_at: created,
  });
  return makeFakeSupabase(
    {
      gift_certificate_redemptions: [redemption(R1, "2026-05-02T00:00:00Z"), redemption(R2, "2026-05-01T00:00:00Z")],
      gift_certificate_instances: [{ id: "i1", public_gift_number: "G-1", product_id: PRODUCT, gift_scope: "STORE" }],
      store_orders: [],
      stores: [{ id: "s1", store_name: "Cafe" }],
      gift_certificate_revenue_ledger: [{ redemption_id: R1, entry_type: "REVENUE_AVAILABLE", amount: 90, created_at: "2026-05-03T00:00:00Z" }],
      gift_certificate_products: [],
      profiles: [],
    },
    (name, args) => {
      if (name !== "admin_gift_revenue_page") return { data: null, error: { message: "unknown" } };
      return {
        data: {
          total: 5600,
          limit: args.p_limit,
          offset: args.p_offset,
          pending_gross: 392000,
          pending_platform_fee: 39200,
          pending_merchant_net: 352800,
          recognized_gross: 112000,
          recognized_platform_fee: 11200,
          recognized_merchant_net: 100800,
          outstanding_gift_value: 38480,
          store_cash_total: 500,
          // DB 순서: R2 먼저 (화면은 이 순서를 지켜야 한다)
          ids: [R2, R1],
        },
        error: null,
      };
    }
  );
}

async function get(path: string) {
  const { GET } = await import("@/app/api/admin/gift-certificates/revenue/route");
  const res = await GET(new NextRequest(`https://samarket.vercel.app${path}`));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 응답 JSON 단언용
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

describe("R7 /api/admin/gift-certificates/revenue", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminPermission.mockReset();
  });

  it("totals = DB totals over the whole ledger (no 5000 caps), same response keys", async () => {
    const f = fixture();
    requireAdminPermission.mockResolvedValue({ ok: true, sb: f.sb });
    const { json } = await get("/api/admin/gift-certificates/revenue");
    expect(requireAdminPermission).toHaveBeenCalledWith("business");
    expect(f.rpcCalls[0]).toEqual({
      name: "admin_gift_revenue_page",
      args: { p_product_id: null, p_instance_id: null, p_limit: 1, p_offset: 0 },
    });
    expect(json).toEqual({
      ok: true,
      redeemedGross: 504000,
      platformFee: 11200,
      merchantNet: 100800,
      pendingGross: 392000,
      pendingPlatformFee: 39200,
      pendingMerchantNet: 352800,
      recognizedGross: 112000,
      recognizedPlatformFee: 11200,
      recognizedMerchantNet: 100800,
      outstandingGiftValue: 38480,
      storeCashTotal: 500,
    });
    expect(f.limitCalls().some((l) => l.n === 5000)).toBe(false);
  });

  it("detail=1&limit&offset → server page: RPC limit ≤ 100, rows read by id in DB order, total", async () => {
    const f = fixture();
    requireAdminPermission.mockResolvedValue({ ok: true, sb: f.sb });
    const { json } = await get(`/api/admin/gift-certificates/revenue?detail=1&limit=500&offset=100&productId=${PRODUCT}`);
    expect(f.rpcCalls[0]?.args).toEqual({ p_product_id: PRODUCT, p_instance_id: null, p_limit: 100, p_offset: 100 });
    expect(json.total).toBe(5600);
    expect(json.limit).toBe(100);
    expect(json.offset).toBe(100);
    expect(json.details.map((d: { redemptionId: string }) => d.redemptionId)).toEqual([R2, R1]);
    expect(json.details[1].recognitionState).toBe("recognized");
    const redemptionRead = f.calls.find((c) => c.table === "gift_certificate_redemptions")!;
    expect(redemptionRead.ops).toContainEqual(["in", ["id", [R2, R1]]]);
    expect(redemptionRead.ops.some(([op]) => op === "limit")).toBe(false);
  });

  it("legacy detail=1 (no limit) keeps the old shape: details without total", async () => {
    const f = fixture();
    requireAdminPermission.mockResolvedValue({ ok: true, sb: f.sb });
    const { json } = await get("/api/admin/gift-certificates/revenue?detail=1");
    expect(Array.isArray(json.details)).toBe(true);
    expect(json.total).toBeUndefined();
    expect(f.limitCalls().filter((l) => l.table === "gift_certificate_redemptions")).toEqual([
      { table: "gift_certificate_redemptions", n: 500 },
    ]);
  });

  it("panel pages through the server (no slice(0, 200))", () => {
    const panel = readFileSync(resolve(process.cwd(), "components/admin/gift/panels/AdminGiftRevenuePanel.tsx"), "utf8");
    expect(panel).not.toContain("slice(0, 200)");
    expect(panel).toContain("revenue?detail=1&limit=${detailSize}&offset=${offset}");
    expect(panel).toContain("<AdminPagination");
    const mig = readFileSync(resolve(process.cwd(), "supabase/migrations/20270601142000_r7_admin_gift_revenue_page.sql"), "utf8");
    expect(mig).toMatch(/REVOKE ALL ON FUNCTION public\.admin_gift_revenue_page\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(mig).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_gift_revenue_page\([^)]*\) TO service_role/);
  });
});
