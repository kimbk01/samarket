/**
 * PRD-16 최종 확인 — 현재 상품 이미지 교체·삭제: 저장 성공 후 이 매장 업로드 원본 중 빠진 것만 Storage 에서 정리.
 * 다른 매장·외부 URL 은 지우지 않고, 저장 실패(409) 시 아무것도 지우지 않는다. 과거 파일 일괄 삭제 없음.
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
const removeImages = vi.fn(async (_i: { urls: string[] }) => ({ failed: [] as string[] }));
vi.mock("@/lib/media/canonical-image-lifecycle.server", async (orig) => ({
  ...(await orig<typeof import("@/lib/media/canonical-image-lifecycle.server")>()),
  removeCanonicalImagesFromPublicUrls: (i: { urls: string[] }) => removeImages(i),
}));

/** HB-1 — 다른 행 참조 확인은 별도 테스트(delivery-sample-ops-images); 여기서는 참조 없음으로 둔다 */
const dropStillReferenced = vi.fn(async (_sb: unknown, _sid: string, urls: string[]) => urls);
vi.mock("@/lib/stores/store-product-images-orphan-gc.server", () => ({
  dropStillReferencedStoreImageUrls: (sb: unknown, sid: string, urls: string[]) => dropStillReferenced(sb, sid, urls),
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

const BASE = "https://proj.supabase.co/storage/v1/object/public/store-product-images";
const OLD = `${BASE}/store-1/old.jpg`;
const NEW = `${BASE}/store-1/new.jpg`;
const OTHER_STORE = `${BASE}/store-2/x.jpg`;

describe("PRD-16 current image replace/delete", () => {
  it("replacing the thumbnail removes only the previous store-owned original", async () => {
    scenario(productRow({ thumbnail_url: OLD, images_json: [OTHER_STORE] }));
    const r = await patch({ thumbnail_url: NEW, expected_updated_at: UPDATED_AT });
    expect(r.status).toBe(200);
    expect(removeImages).toHaveBeenCalledTimes(1);
    expect(removeImages.mock.calls[0][0].urls).toEqual([OLD]);
  });

  it("removing a detail image deletes it; other-store / external URLs are never deleted", async () => {
    scenario(productRow({ thumbnail_url: NEW, images_json: [OLD, OTHER_STORE, "https://cdn.example.com/a.jpg"] }));
    const r = await patch({ images_json: [], expected_updated_at: UPDATED_AT });
    expect(r.status).toBe(200);
    expect(removeImages.mock.calls[0][0].urls).toEqual([OLD]);
  });

  it("HB-1 an image another product still uses is not deleted", async () => {
    dropStillReferenced.mockImplementationOnce(async () => []);
    scenario(productRow({ thumbnail_url: OLD }));
    const r = await patch({ thumbnail_url: NEW, expected_updated_at: UPDATED_AT });
    expect(r.status).toBe(200);
    expect(dropStillReferenced).toHaveBeenCalledWith(expect.anything(), "store-1", [OLD]);
    expect(removeImages).not.toHaveBeenCalled();
  });

  it("stale save (409) deletes nothing", async () => {
    scenario(productRow({ thumbnail_url: OLD }));
    const r = await patch({ thumbnail_url: NEW, expected_updated_at: "2026-10-01T00:00:00.000000+00:00" });
    expect(r.status).toBe(409);
    expect(removeImages).not.toHaveBeenCalled();
  });

  it("unchanged images → no storage call", async () => {
    scenario(productRow({ thumbnail_url: OLD }));
    const r = await patch({ title: "Burger v3", expected_updated_at: UPDATED_AT });
    expect(r.status).toBe(200);
    expect(removeImages).not.toHaveBeenCalled();
  });
});
