/**
 * 1-J — 오너 상품 PATCH: PRD-03(재검수 대기 판매 차단) · PRD-04(할인가) · PRD-06(manual 품절) ·
 * PRD-07(낙관적 잠금) · ND-1(관리자 잠금) · OPS-02(공용 세대 bump).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeStoreSupabase,
  filterValue,
  type FakeCall,
  type FakeResult,
} from "@/lib/stores/__tests__/helpers/fake-store-supabase";

const bump = vi.fn();
const invalidateOwnerList = vi.fn();
let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
let fake = createFakeStoreSupabase((c) => handler(c));

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/i18n/load-user-app-language", () => ({ loadUserAppLanguage: async () => "ko" }));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: async () => ({ ok: true, profile: {} }),
  requirePhoneVerified: async () => ({ ok: true, profile: {} }),
}));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async () => ({
    ok: true,
    store: { id: "store-1", owner_user_id: "owner-1", approval_status: "approved", owner_can_edit_store_identity: false },
  }),
  canOwnerSellProducts: async () => true,
  ownerStoreOperationalWriteBlock: () => null,
  ownerStoreProfileWriteBlock: () => null,
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (...a: unknown[]) => bump(...a),
}));
vi.mock("@/lib/stores/owner-products-list-snapshot", () => ({
  invalidateOwnerProductsListCache: (...a: unknown[]) => invalidateOwnerList(...a),
}));
vi.mock("@/lib/stores/store-menus-snapshot-invalidate-by-store-id", () => ({
  invalidateStoreMenusSnapshotCacheByStoreId: () => {},
}));
vi.mock("@/lib/stores/owner-recommended-menu-limit", () => ({
  countOwnerRecommendedProducts: async () => 0,
  OWNER_RECOMMENDED_MENU_MAX: 6,
}));
vi.mock("@/lib/media/canonical-image-lifecycle.server", () => ({
  collectCanonicalImagePublicUrls: () => [],
  diffRemovedImageUrls: () => [],
  removeCanonicalImagesFromPublicUrls: async () => ({ failed: [] }),
}));

import { PATCH } from "@/app/api/me/stores/[storeId]/products/[productId]/route";

const UPDATED_AT = "2026-10-20T10:00:00.000000+00:00";

function productRow(over: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    store_id: "store-1",
    title: "Burger",
    price: 100,
    discount_price: 90,
    discount_percent: 10,
    stock_qty: 5,
    track_inventory: true,
    thumbnail_url: "https://x/t.jpg",
    images_json: [],
    product_status: "active",
    admin_review_status: "none",
    admin_status_lock: null,
    sold_out_reason: null,
    is_owner_recommended: false,
    is_representative: false,
    is_featured: false,
    updated_at: UPDATED_AT,
    ...over,
  };
}

function scenario(row: Record<string, unknown>, opts: { missingLockColumns?: boolean } = {}) {
  let current = { ...row };
  handler = (call) => {
    if (call.table !== "store_products") return { data: [], error: null };
    if (call.op === "select") {
      if (opts.missingLockColumns && String(call.select).includes("admin_status_lock")) {
        return { data: null, error: { message: "column store_products.admin_status_lock does not exist" } };
      }
      return { data: current, error: null };
    }
    if (call.op === "update") {
      const expected = filterValue(call, "updated_at");
      if (expected !== undefined && expected !== current.updated_at) return { data: [], error: null };
      current = { ...current, ...call.patch, updated_at: "2026-10-20T10:00:05.000000+00:00" };
      return { data: [{ id: current.id, updated_at: current.updated_at }], error: null };
    }
    return { data: null, error: null };
  };
  return {
    get row() {
      return current;
    },
    set row(v: Record<string, unknown>) {
      current = v;
    },
  };
}

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("https://x.test/api/me/stores/store-1/products/p-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ storeId: "store-1", productId: "p-1" }) }
  );
}

function updateCalls() {
  return fake.calls.filter((c) => c.table === "store_products" && c.op === "update");
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeStoreSupabase((c) => handler(c));
});

describe("PRD-03 rejected → edit → sell", () => {
  it("rejected product edit moves to pending; selling stays blocked until admin approval", async () => {
    const s = scenario(productRow({ product_status: "hidden", admin_review_status: "rejected" }));
    const r1 = await patch({ title: "Burger v2" });
    expect(r1.status).toBe(200);
    expect(s.row.admin_review_status).toBe("pending");

    const r2 = await patch({ product_status: "active" });
    expect(r2.status).toBe(403);
    expect((await r2.json()).error).toBe("admin_review_pending");

    // 관리자 검수 승인 후 판매 가능
    s.row = { ...s.row, admin_review_status: "approved" };
    const r3 = await patch({ product_status: "active" });
    expect(r3.status).toBe(200);
    expect(s.row.product_status).toBe("active");
  });
});

describe("ND-1 admin lock", () => {
  it("owner cannot reverse admin hide / sold_out (403 admin_locked, no write)", async () => {
    scenario(productRow({ product_status: "hidden", admin_status_lock: "hidden" }));
    const res = await patch({ product_status: "active" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("admin_locked");
    expect(updateCalls()).toHaveLength(0);

    scenario(productRow({ product_status: "sold_out", admin_status_lock: "sold_out", sold_out_reason: "admin" }));
    const res2 = await patch({ product_status: "active" });
    expect((await res2.json()).error).toBe("admin_locked");
  });

  it("locked product still accepts non-status edits (stock/title) without touching status", async () => {
    const s = scenario(productRow({ product_status: "sold_out", admin_status_lock: "sold_out", sold_out_reason: "admin" }));
    const res = await patch({ stock_qty: 9, product_status: "sold_out" });
    expect(res.status).toBe(200);
    const up = updateCalls()[0];
    expect(up.patch).toEqual({ stock_qty: 9 });
    expect(s.row.product_status).toBe("sold_out");
    expect(s.row.sold_out_reason).toBe("admin");
  });
});

describe("PRD-06 owner manual sold_out", () => {
  it("owner sold_out writes reason manual; back to active clears it", async () => {
    const s = scenario(productRow());
    await patch({ product_status: "sold_out" });
    expect(s.row.sold_out_reason).toBe("manual");
    await patch({ product_status: "active" });
    expect(s.row.sold_out_reason).toBeNull();
  });
});

describe("PRD-07 optimistic lock", () => {
  it("stale expected_updated_at → 409 product_changed with latest row", async () => {
    scenario(productRow({ stock_qty: 0, product_status: "sold_out", sold_out_reason: "stock" }));
    const res = await patch({ stock_qty: 5, expected_updated_at: "2026-10-20T09:00:00.000000+00:00" });
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.error).toBe("product_changed");
    expect(j.product?.stock_qty).toBe(0);
    expect(bump).not.toHaveBeenCalled();
  });

  it("matching expected_updated_at → 200, conditional update, new updated_at, OPS-02 bump", async () => {
    scenario(productRow());
    const res = await patch({ title: "New", expected_updated_at: UPDATED_AT });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.updated_at).toBe("2026-10-20T10:00:05.000000+00:00");
    expect(filterValue(updateCalls()[0], "updated_at")).toBe(UPDATED_AT);
    expect(bump).toHaveBeenCalledWith("owner_store.product_update");
    expect(invalidateOwnerList).toHaveBeenCalledWith("store-1");
  });
});

describe("PRD-04 discount integrity", () => {
  it("direct discount_price >= price → 400 invalid_discount_price", async () => {
    scenario(productRow());
    const res = await patch({ discount_price: 100 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_discount_price");
    expect(updateCalls()).toHaveLength(0);
  });

  it("price-only change recomputes discount from current percent", async () => {
    scenario(productRow());
    await patch({ price: 200 });
    expect(updateCalls()[0].patch).toMatchObject({ price: 200, discount_price: 180, discount_percent: 10 });
  });
});

describe("pre-migration fallback", () => {
  it("missing lock columns → legacy select and lock/reason keys stripped from the write", async () => {
    const s = scenario(productRow({ admin_status_lock: undefined, sold_out_reason: undefined }), {
      missingLockColumns: true,
    });
    const res = await patch({ product_status: "sold_out" });
    expect(res.status).toBe(200);
    expect(updateCalls()[0].patch).toEqual({ product_status: "sold_out" });
    expect(s.row.product_status).toBe("sold_out");
  });
});
