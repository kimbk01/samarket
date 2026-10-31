/**
 * 5단계 L1 — S01 상품 등록·수정 → 주문자 메뉴 (G-2 §5-2 S01).
 *
 * 같은 상품 ID 를 한 개의 in-memory `store_products` 로 추적한다:
 *   오너 POST/PATCH(`/api/me/stores/[storeId]/products*`) → 관리자 목록(`GET /api/admin/store-products`)
 *   → 주문자 상품 상세(`GET /api/stores/products/[productId]`).
 * PASS 조건(L1 범위): 오너 저장 값 = 관리자 목록 값 = 주문자 상세 값(가격·상태·옵션), 쓰기마다 공용 캐시 세대 +1(OPS-02),
 * 숨김은 주문자에게 404, 품절은 상태 그대로 노출.
 * 메뉴판 스냅샷(DB RPC)·체크아웃 재계산(`price_changed`)·직접 REST 42501 은 L2 — 이 파일에서 다루지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeStoreSupabase,
  filterValue,
  type FakeCall,
  type FakeResult,
} from "@/lib/stores/__tests__/helpers/fake-store-supabase";

const bump = vi.fn();
let viewerId: string | null = "owner-1";
let isAdmin = true;
let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
/** S-01 — 상품 공개 판정 = DB store_public_menu_open RPC. 이 시나리오 매장은 판매 승인 매장 → true. */
const publicMenuOpenRpc = (fn: string) =>
  fn === "store_public_menu_open" ? { data: true, error: null } : { data: null, error: null };
let fake = createFakeStoreSupabase((c) => handler(c), publicMenuOpenRpc);

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => viewerId }));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => isAdmin }));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: async () => ({ ok: true, profile: {} }),
  requirePhoneVerified: async () => ({ ok: true, profile: {} }),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/i18n/load-user-app-language", () => ({ loadUserAppLanguage: async () => "ko" }));
vi.mock("@/lib/stores/owner-product-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stores/owner-product-gate")>();
  return {
    ...actual,
    getStoreIfOwner: async () => ({
      ok: true,
      store: { id: "store-1", owner_user_id: "owner-1", approval_status: "approved", owner_can_edit_store_identity: false },
    }),
    canOwnerSellProducts: async () => true,
  };
});
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (...a: unknown[]) => bump(...a),
  syncStorePublicReadCachesWithSharedGeneration: async () => {},
}));
vi.mock("@/lib/stores/owner-products-list-snapshot", () => ({
  invalidateOwnerProductsListCache: () => {},
  loadOwnerProductsListSnapshot: async () => ({ ok: false, error: "unused" }),
  parseOwnerProductsListLimit: () => undefined,
  peekOwnerProductsListCacheHit: () => false,
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
vi.mock("@/lib/auth/active-session", () => ({
  readActiveSessionIdCookie: async () => "sess",
  readActiveSessionFingerprintForUser: async () => "sess",
}));
vi.mock("@/lib/auth/auth-session-validate-cache", () => ({ peekAuthSessionValidateCached: () => true }));
vi.mock("@/lib/auth/auth-session-validate-dedupe", () => ({
  validateActiveSessionLightDeduped: async () => ({ ok: true, ttlCacheHit: true }),
}));
vi.mock("@/lib/stores/owner-store-ownership-cache", () => ({
  getCachedStoreIfOwner: async () => ({ ok: true, store: { id: "store-1" } }),
  peekOwnerStoreOwnershipCacheHit: () => true,
}));
vi.mock("@/lib/stores/store-orderability-policy", () => ({
  resolveStoreOrderability: async () => ({
    viewer_is_owner: false,
    viewer_is_admin: false,
    can_order_store: true,
    owner_block_message: null,
  }),
}));

import { POST } from "@/app/api/me/stores/[storeId]/products/route";
import { PATCH } from "@/app/api/me/stores/[storeId]/products/[productId]/route";
import { GET as adminList } from "@/app/api/admin/store-products/route";
import { GET as buyerDetail } from "@/app/api/stores/products/[productId]/route";

type Row = Record<string, unknown>;
const SECTION = { id: "sec-1", name: "Main", sort_order: 0, is_hidden: false };

/** One `store_products` table shared by the owner, admin and buyer routes (PostgREST filters applied). */
function productWorld() {
  const rows: Row[] = [];
  let clock = 0;
  const matches = (call: FakeCall, r: Row) =>
    call.filters.every(([m, col, val]) => {
      if (m === "eq") return r[col] === val;
      if (m === "in") return Array.isArray(val) && val.includes(r[col]);
      return true;
    });
  handler = (call) => {
    if (call.table === "store_menu_sections") return { data: [{ id: SECTION.id }], error: null };
    if (call.table === "stores") {
      const store = { id: "store-1", owner_user_id: "owner-1", approval_status: "approved", is_visible: true, store_name: "S", slug: "s" };
      return { data: call.single ? store : [store], error: null };
    }
    if (call.table === "store_sales_permissions") {
      return { data: { allowed_to_sell: true, sales_status: "approved" }, error: null };
    }
    if (call.table !== "store_products") return { data: null, error: null };
    if (call.op === "insert") {
      const created = {
        ...(call.patch as Row),
        id: `p-${rows.length + 1}`,
        admin_review_status: "none",
        admin_status_lock: null,
        updated_at: `2026-10-21T00:00:0${clock++}Z`,
      };
      rows.push(created);
      return { data: { id: created.id }, error: null };
    }
    if (call.op === "update") {
      const row = rows.find((r) => matches(call, r));
      if (!row) return { data: [], error: null };
      Object.assign(row, call.patch, { updated_at: `2026-10-21T00:00:0${clock++}Z` });
      return { data: [{ id: row.id, updated_at: row.updated_at }], error: null };
    }
    const hits = rows.filter((r) => matches(call, r)).map((r) => ({ ...r, store_menu_sections: SECTION }));
    if (call.single) return { data: hits[0] ?? null, error: null };
    return { data: hits, error: null };
  };
  return rows;
}

const ownerCtx = { params: Promise.resolve({ storeId: "store-1" }) };

async function ownerCreate(body: Row) {
  viewerId = "owner-1";
  const res = await POST(
    new Request("https://x.test/api/me/stores/store-1/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    ownerCtx
  );
  return { status: res.status, body: (await res.json()) as Row };
}

async function ownerPatch(productId: string, body: Row) {
  viewerId = "owner-1";
  const res = await PATCH(
    new Request(`https://x.test/api/me/stores/store-1/products/${productId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ storeId: "store-1", productId }) }
  );
  return { status: res.status, body: (await res.json()) as Row };
}

async function adminRow(productId: string) {
  isAdmin = true;
  const res = await adminList(new Request("https://x.test/api/admin/store-products?store_id=store-1"));
  const j = (await res.json()) as { products: Row[] };
  return j.products.find((p) => p.id === productId) ?? null;
}

async function buyerView(productId: string) {
  viewerId = "buyer-1";
  const res = await buyerDetail(new Request("https://x.test"), { params: Promise.resolve({ productId }) });
  return { status: res.status, body: (await res.json()) as { product?: Row } };
}

const createBody = {
  title: "Burger",
  price: 100,
  menu_section_id: SECTION.id,
  thumbnail_url: "https://x/t.jpg",
  product_status: "active",
  client_request_id: "3f2a9d1c-1111-4444-8888-000000000001",
};

beforeEach(() => {
  vi.clearAllMocks();
  isAdmin = true;
  fake = createFakeStoreSupabase((c) => handler(c), publicMenuOpenRpc);
});

describe("S01-1 등록 → 오너·관리자·주문자 같은 값", () => {
  it("POST creates exactly one row, bumps the shared generation; admin list and buyer detail show the same price/status", async () => {
    const rows = productWorld();
    const created = await ownerCreate(createBody);
    expect(created.status).toBe(200);
    expect(rows).toHaveLength(1);
    const id = String((created.body.product as Row).id);
    expect(bump).toHaveBeenCalledWith("owner_store.product_create");

    const admin = await adminRow(id);
    expect(admin).toMatchObject({ id, price: 100, product_status: "active" });

    const buyer = await buyerView(id);
    expect(buyer.status).toBe(200);
    expect(buyer.body.product).toMatchObject({ id, price: 100, product_status: "active" });
  });

  it("admin list without the admin permission → 403 (no row data)", async () => {
    productWorld();
    await ownerCreate(createBody);
    isAdmin = false;
    const res = await adminList(new Request("https://x.test/api/admin/store-products"));
    expect(res.status).toBe(403);
  });
});

describe("S01-2 가격·옵션 수정 → 같은 값 전파", () => {
  it("PATCH price + option group → admin list and buyer detail carry the new price and options; generation bumped", async () => {
    productWorld();
    const id = String(((await ownerCreate(createBody)).body.product as Row).id);
    bump.mockClear();
    const options = [
      {
        id: "g1",
        nameKo: "Size",
        inputType: "radio",
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          { id: "a", name: "Regular", priceDelta: 0 },
          { id: "b", name: "Large", priceDelta: 20 },
        ],
      },
    ];
    const res = await ownerPatch(id, { price: 150, options_json: options });
    expect(res.status).toBe(200);
    expect(bump).toHaveBeenCalledWith("owner_store.product_update");

    expect(await adminRow(id)).toMatchObject({ price: 150, product_status: "active" });
    const buyer = await buyerView(id);
    expect(buyer.status).toBe(200);
    expect(buyer.body.product?.price).toBe(150);
    const groups = buyer.body.product?.options_json as Array<{ id: string; options: Array<{ name: string; priceDelta: number }> }>;
    expect(groups[0].id).toBe("g1");
    expect(groups[0].options.map((o) => [o.name, o.priceDelta])).toEqual([
      ["Regular", 0],
      ["Large", 20],
    ]);
  });
});

describe("S01-3 품절·숨김 → 주문자 노출", () => {
  it("owner sold_out → buyer still sees the product as sold_out (manual reason), admin list same status", async () => {
    const rows = productWorld();
    const id = String(((await ownerCreate(createBody)).body.product as Row).id);
    bump.mockClear();
    expect((await ownerPatch(id, { product_status: "sold_out" })).status).toBe(200);
    expect(rows[0]).toMatchObject({ product_status: "sold_out", sold_out_reason: "manual" });
    expect(bump).toHaveBeenCalledWith("owner_store.product_update");
    expect(await adminRow(id)).toMatchObject({ product_status: "sold_out" });
    const buyer = await buyerView(id);
    expect(buyer.status).toBe(200);
    expect(buyer.body.product?.product_status).toBe("sold_out");
  });

  it("owner hidden → buyer detail 404 (query filters active/sold_out), admin list shows hidden; back to active → visible again", async () => {
    productWorld();
    const id = String(((await ownerCreate(createBody)).body.product as Row).id);
    expect((await ownerPatch(id, { product_status: "hidden" })).status).toBe(200);
    expect(await adminRow(id)).toMatchObject({ product_status: "hidden" });
    expect((await buyerView(id)).status).toBe(404);
    const detailCall = fake.calls.filter((c) => c.table === "store_products" && c.single && filterValue(c, "id") === id).at(-1);
    expect(detailCall?.filters).toContainEqual(["in", "product_status", ["active", "sold_out"]]);

    expect((await ownerPatch(id, { product_status: "active" })).status).toBe(200);
    expect((await buyerView(id)).status).toBe(200);
  });
});
