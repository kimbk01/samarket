/**
 * v4 재감사 PERF-09 · API-14 — 상품 상세 API 로그인 게이트(401 login_required) +
 * 상품 페이지 공유 메타는 자기 API HTTP 호출이 아니라 공용 서버 로더(쿠키 무관).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeStoreSupabase,
  type FakeCall,
  type FakeResult,
} from "@/lib/stores/__tests__/helpers/fake-store-supabase";
import { clearStoreRecentOrderCountCache } from "@/lib/stores/store-recent-order-count-cache";

let viewerId: string | null = null;
let productRow: Record<string, unknown> | null = null;
let storeRow: Record<string, unknown> | null = null;
let menuOpen = true;
const handler = (call: FakeCall): FakeResult => {
  if (call.table === "store_products") return { data: productRow, error: null };
  if (call.table === "stores") return { data: storeRow, error: null };
  if (call.table === "store_favorites") return { data: null, error: null, count: 1 } as FakeResult;
  if (call.table === "store_orders") return { data: null, error: null, count: 0 } as FakeResult;
  return { data: null, error: null };
};
let fake = createFakeStoreSupabase(handler, (fn) =>
  fn === "store_public_menu_open" ? { data: menuOpen, error: null } : { data: null, error: null }
);

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => viewerId }));
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
import { loadStoreProductPublicMetaCached } from "@/lib/stores/store-product-public-detail-loader";

const get = async () =>
  GET(new Request("https://x.test"), { params: Promise.resolve({ productId: "p-1" }) });

beforeEach(() => {
  viewerId = null;
  menuOpen = true;
  clearStoreRecentOrderCountCache();
  productRow = {
    id: "p-1",
    store_id: "store-1",
    title: "Burger",
    summary: "Juicy",
    thumbnail_url: "https://img.test/t.jpg",
    images_json: ["https://img.test/a.jpg"],
    product_status: "active",
    admin_review_status: "none",
    store_menu_sections: { id: "sec", name: "Main", sort_order: 0, is_hidden: false },
  };
  storeRow = {
    id: "store-1",
    owner_user_id: "owner",
    slug: "burger-house",
    store_name: "Burger House",
    approval_status: "approved",
    is_visible: true,
    store_kind: "real",
  };
  fake = createFakeStoreSupabase(handler, (fn) =>
    fn === "store_public_menu_open" ? { data: menuOpen, error: null } : { data: null, error: null }
  );
});

describe("API-14 — 상품 상세 API 로그인 게이트", () => {
  it("비로그인 → 401 login_required (다른 상세 API 와 같은 형태, 캐시 금지)", async () => {
    const res = await get();
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const j = await res.json();
    expect(j).toMatchObject({ ok: false, error: "login_required", meta: { viewer_gate: "login_required" } });
    expect(j.product).toBeNull();
    expect(j.store).toBeNull();
  });

  it("로그인 → 200 (기존 응답)", async () => {
    viewerId = "u-1";
    const res = await get();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.product.title).toBe("Burger");
    expect(j.store.slug).toBe("burger-house");
  });
});

describe("PERF-09 — 공유 메타 서버 로더 (쿠키·로그인 무관)", () => {
  it("비로그인 상태에서도 제목·요약·이미지·매장명을 돌려준다", async () => {
    viewerId = null;
    const meta = await loadStoreProductPublicMetaCached("p-1");
    expect(meta).toEqual({
      product: {
        title: "Burger",
        summary: "Juicy",
        thumbnail_url: "https://img.test/t.jpg",
        images_json: ["https://img.test/a.jpg"],
      },
      store: { store_name: "Burger House", slug: "burger-house" },
    });
  });

  it("노출 불가(숨김 구역·미승인 매장·메뉴 비공개) → null (API 404 와 같은 판정)", async () => {
    productRow = { ...productRow!, store_menu_sections: { id: "s", name: "H", sort_order: 0, is_hidden: true } };
    expect(await loadStoreProductPublicMetaCached("p-hidden")).toBeNull();
    productRow = { ...productRow!, store_menu_sections: { id: "s", name: "M", sort_order: 0, is_hidden: false } };
    storeRow = { ...storeRow!, is_visible: false };
    expect(await loadStoreProductPublicMetaCached("p-invisible")).toBeNull();
    storeRow = { ...storeRow!, is_visible: true };
    menuOpen = false;
    expect(await loadStoreProductPublicMetaCached("p-closed")).toBeNull();
  });

  it("상품 페이지 generateMetadata 는 자기 API 를 HTTP 로 부르지 않는다", () => {
    const src = readFileSync(
      path.join(process.cwd(), "app/(main)/stores/[slug]/p/[productId]/page.tsx"),
      "utf8"
    );
    expect(src).toContain("loadStoreProductPublicMetaCached");
    expect(src).not.toMatch(/fetch\(\s*`\$\{base\}\/api\/stores\/products/);
  });
});
