/**
 * 1-J — 관리자 상품 조치: PRD-04 가격 정정 할인가 재계산 · ND-1 잠금 설정 · PRD-09 오너 목록 캐시 무효화.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeStoreSupabase,
  type FakeCall,
  type FakeResult,
} from "@/lib/stores/__tests__/helpers/fake-store-supabase";

const bump = vi.fn();
const invalidateOwnerList = vi.fn();
let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
let fake = createFakeStoreSupabase((c) => handler(c));

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1" } }),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({ appendAdminRouteAudit: async () => {} }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/stores/store-menus-snapshot-invalidate-by-store-id", () => ({
  invalidateStoreMenusSnapshotCacheByStoreId: () => {},
}));
vi.mock("@/lib/stores/store-home-feed-server-cache", () => ({ clearStoreHomeFeedServerCache: () => {} }));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (...a: unknown[]) => bump(...a),
}));
vi.mock("@/lib/stores/owner-products-list-snapshot", () => ({
  invalidateOwnerProductsListCache: (...a: unknown[]) => invalidateOwnerList(...a),
}));

import { PATCH } from "@/app/api/admin/store-products/[productId]/route";

function scenario(row: Record<string, unknown>, opts: { missingLockColumns?: boolean } = {}) {
  handler = (call) => {
    if (call.op === "select" && call.table === "store_products") {
      if (opts.missingLockColumns && String(call.select).includes("admin_status_lock")) {
        return { data: null, error: { message: "column store_products.admin_status_lock does not exist" } };
      }
      return { data: row, error: null };
    }
    if (call.op === "update") return { data: [{ id: row.id }], error: null };
    return { data: null, error: null };
  };
}

function call(body: Record<string, unknown>) {
  return PATCH(
    new Request("https://x.test/api/admin/store-products/p-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ productId: "p-1" }) }
  );
}

const ROW = {
  id: "p-1",
  store_id: "store-1",
  product_status: "active",
  admin_review_status: "none",
  title: "Burger",
  price: 100,
  discount_price: 90,
  discount_percent: 10,
  admin_status_lock: null,
  sold_out_reason: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeStoreSupabase((c) => handler(c));
});

describe("admin store product ops — 1-J", () => {
  it("PRD-04 correct_price recomputes discount from current percent", async () => {
    scenario(ROW);
    const res = await call({ action: "correct_price", price: 200 });
    expect(res.status).toBe(200);
    const up = fake.calls.find((c) => c.op === "update");
    expect(up?.patch).toMatchObject({ price: 200, discount_price: 180, discount_percent: 10 });
    expect(invalidateOwnerList).toHaveBeenCalledWith("store-1");
    expect(bump).toHaveBeenCalled();
  });

  it("ND-1 sold_out sets lock + reason admin; hide sets hidden lock", async () => {
    scenario(ROW);
    await call({ action: "sold_out" });
    expect(fake.calls.find((c) => c.op === "update")?.patch).toMatchObject({
      product_status: "sold_out",
      admin_status_lock: "sold_out",
      sold_out_reason: "admin",
    });
    fake = createFakeStoreSupabase((c) => handler(c));
    await call({ action: "hide", memo: "부적절한 이미지" });
    expect(fake.calls.find((c) => c.op === "update")?.patch).toMatchObject({
      product_status: "hidden",
      admin_status_lock: "hidden",
    });
  });

  it("pre-migration DB: lock keys stripped, action still applied", async () => {
    scenario({ ...ROW, admin_status_lock: undefined, sold_out_reason: undefined }, { missingLockColumns: true });
    const res = await call({ action: "sold_out" });
    expect(res.status).toBe(200);
    expect(fake.calls.find((c) => c.op === "update")?.patch).toEqual({ product_status: "sold_out" });
  });
});
