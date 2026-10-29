/**
 * v4 W2 — 공개 상품 상세: PL-02 `store.isSampleStore`, API-18 내부 필드 제거,
 * PERF-09 독립 단계 병렬(판정 순서·응답 형태 불변), PERF-10 90일 주문 수 메모리 캐시.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeStoreSupabase,
  type FakeCall,
  type FakeResult,
} from "@/lib/stores/__tests__/helpers/fake-store-supabase";
import { clearStoreRecentOrderCountCache } from "@/lib/stores/store-recent-order-count-cache";

let storeRow: Record<string, unknown> | null = null;
let productRow: Record<string, unknown> | null = null;
let menuOpen = true;
let orderCountCalls = 0;
const handler = (call: FakeCall): FakeResult => {
  if (call.table === "store_products") return { data: productRow, error: null };
  if (call.table === "stores") return { data: storeRow, error: null };
  if (call.table === "store_favorites") return { data: null, error: null, count: 7 } as FakeResult;
  if (call.table === "store_orders") {
    orderCountCalls += 1;
    return { data: null, error: null, count: 3 } as FakeResult;
  }
  return { data: null, error: null };
};
let fake = createFakeStoreSupabase(handler, (fn) =>
  fn === "store_public_menu_open" ? { data: menuOpen, error: null } : { data: null, error: null }
);

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => null }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/stores/store-orderability-policy", () => ({
  resolveStoreOrderability: async () => ({
    viewer_is_owner: false,
    viewer_is_admin: false,
    can_order_store: true,
    owner_block_message: null,
  }),
}));

import { GET } from "@/app/api/stores/products/[productId]/route";
import { stripStoreProductPublicInternalFields } from "@/lib/stores/store-product-public-response";

const get = async () =>
  GET(new Request("https://x.test"), { params: Promise.resolve({ productId: "p-1" }) });

const baseProduct = {
  id: "p-1",
  store_id: "store-1",
  title: "Menu",
  product_status: "active",
  admin_review_status: "none",
  stock_qty: 42,
  track_inventory: false,
  store_menu_sections: { id: "sec", name: "Main", sort_order: 0, is_hidden: false },
};
const baseStore = {
  id: "store-1",
  owner_user_id: "owner",
  slug: "s",
  store_name: "S",
  approval_status: "approved",
  is_visible: true,
  store_kind: "sample",
};

beforeEach(() => {
  storeRow = { ...baseStore };
  productRow = { ...baseProduct };
  menuOpen = true;
  orderCountCalls = 0;
  clearStoreRecentOrderCountCache();
  fake = createFakeStoreSupabase(handler, (fn) =>
    fn === "store_public_menu_open" ? { data: menuOpen, error: null } : { data: null, error: null }
  );
});

describe("v4 PL-02 — 상품 상세 응답 store.isSampleStore", () => {
  it("샘플 매장 → true, 실매장 → false, 원문 store_kind·owner_user_id 미노출", async () => {
    const j = await (await get()).json();
    expect(j.store.isSampleStore).toBe(true);
    expect(j.store).not.toHaveProperty("store_kind");
    expect(j.store).not.toHaveProperty("owner_user_id");
    storeRow = { ...baseStore, store_kind: "real" };
    expect((await (await get()).json()).store.isSampleStore).toBe(false);
  });
});

describe("v4 API-18 — 공개 상품 응답 내부 필드", () => {
  it("admin_review_status 항상 제거, 재고 미추적 상품은 stock_qty 제거", async () => {
    const j = await (await get()).json();
    expect(j.product).not.toHaveProperty("admin_review_status");
    expect(j.product).not.toHaveProperty("stock_qty");
  });
  it("재고 추적 상품은 화면 수량 상한·품절 판정용 stock_qty 유지", async () => {
    productRow = { ...baseProduct, track_inventory: true };
    const j = await (await get()).json();
    expect(j.product.stock_qty).toBe(42);
  });
  it("strip 헬퍼 단위", () => {
    const a: Record<string, unknown> = { admin_review_status: "none", stock_qty: 1, track_inventory: true };
    stripStoreProductPublicInternalFields(a);
    expect(a).toEqual({ stock_qty: 1, track_inventory: true });
  });
});

describe("v4 PERF-09 — 병렬화 후 판정·응답 동일", () => {
  it("숨김·미승인 매장 / 메뉴 비공개 → 404 (기존 순서)", async () => {
    storeRow = { ...baseStore, is_visible: false };
    expect((await get()).status).toBe(404);
    storeRow = { ...baseStore };
    menuOpen = false;
    expect((await get()).status).toBe(404);
    productRow = null;
    expect((await get()).status).toBe(404);
  });
  it("매장·메뉴 공개·찜 수·주문 수는 product.store_id 로 같은 단계에서 조회", async () => {
    const j = await (await get()).json();
    expect(j.store.favorite_count).toBe(7);
    expect(j.store.recent_order_count).toBe(3);
    const tables = fake.calls.map((c) => c.table);
    expect(tables[0]).toBe("store_products");
    expect(new Set(tables.slice(1))).toEqual(new Set(["stores", "store_favorites", "store_orders"]));
  });
  it("PERF-10 — 90일 주문 수는 매장 단위 메모리 캐시 (반복 요청 count 1회)", async () => {
    await get();
    await get();
    expect(orderCountCalls).toBe(1);
  });
});
