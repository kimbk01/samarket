/**
 * 묶음3-A S-01·S-03 — 「메뉴 공개」(DB store_public_menu_open RPC) ≠ 「판매 가능」(canSell, 주문 전용).
 * 샘플 매장: 메뉴 공개 · canSell=false · isSampleStore=true (store_kind 원문은 공개 응답에 없음).
 * 판매 미승인 실매장: RPC false → 메뉴 비공개 유지.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeStoreSupabase,
  type FakeCall,
  type FakeResult,
} from "@/lib/stores/__tests__/helpers/fake-store-supabase";

let storeRow: Record<string, unknown> = {};
let perm: Record<string, unknown> | null = null;
let menuOpen = false;
let rpcError = false;
const handler = (call: FakeCall): FakeResult => {
  if (call.table === "stores") return { data: storeRow, error: null };
  if (call.table === "store_sales_permissions") return { data: perm, error: null };
  if (call.table === "store_products") {
    return {
      data: [{ id: "p-1", title: "Sample menu", store_menu_sections: { id: "s", is_hidden: false } }],
      error: null,
    };
  }
  return { data: null, error: null };
};
const rpcHandler = (fn: string): FakeResult => {
  if (fn !== "store_public_menu_open") return { data: null, error: null };
  return rpcError ? { data: null, error: { message: "boom" } } : { data: menuOpen, error: null };
};
let fake = createFakeStoreSupabase(handler, rpcHandler);

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

import { GET as getLegacyDetail } from "@/app/api/stores/[slug]/route";
import { fetchStoreSummaryPublicShared } from "@/lib/stores/fetch-store-summary-public";
import { isSampleStoreKind, loadStorePublicMenuOpen } from "@/lib/stores/store-public-menu-open";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resetApprovedStoreSlugCacheForTests } from "@/lib/stores/get-approved-store-by-slug";

const baseStore = {
  id: "store-1",
  slug: "demo",
  store_name: "Demo",
  owner_user_id: "owner",
  approval_status: "approved",
  is_visible: true,
};

function sampleStore() {
  storeRow = { ...baseStore, store_kind: "sample" };
  perm = { allowed_to_sell: false, sales_status: "pending" };
  menuOpen = true;
}
function unapprovedRealStore() {
  storeRow = { ...baseStore, store_kind: "real" };
  perm = { allowed_to_sell: false, sales_status: "pending" };
  menuOpen = false;
}

beforeEach(() => {
  resetApprovedStoreSlugCacheForTests();
  rpcError = false;
  fake = createFakeStoreSupabase(handler, rpcHandler);
});

describe("isSampleStoreKind / loadStorePublicMenuOpen", () => {
  it("store_kind 'sample' 만 샘플", () => {
    expect(isSampleStoreKind("sample")).toBe(true);
    expect(isSampleStoreKind(" sample ")).toBe(true);
    expect(isSampleStoreKind("real")).toBe(false);
    expect(isSampleStoreKind("legacy_test")).toBe(false);
    expect(isSampleStoreKind(null)).toBe(false);
  });
  it("RPC true/false 그대로, 오류는 fail-closed(false)", async () => {
    const sb = fake.sb as unknown as SupabaseClient;
    menuOpen = true;
    expect(await loadStorePublicMenuOpen(sb, "store-1")).toBe(true);
    menuOpen = false;
    expect(await loadStorePublicMenuOpen(sb, "store-1")).toBe(false);
    rpcError = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadStorePublicMenuOpen(sb, "store-1")).toBe(false);
    err.mockRestore();
    expect(await loadStorePublicMenuOpen(sb, "")).toBe(false);
  });
});

describe("summary 공개 본문", () => {
  it("샘플: canSell=false · menuOpen=true · isSampleStore=true · store_kind 미노출", async () => {
    sampleStore();
    const r = await fetchStoreSummaryPublicShared(fake.sb as unknown as SupabaseClient, "demo");
    expect(r.status).toBe(200);
    expect(r.body.meta).toMatchObject({ canSell: false, menuOpen: true, isSampleStore: true });
    expect(r.body.store).not.toHaveProperty("store_kind");
    expect(r.body.store).not.toHaveProperty("owner_user_id");
  });
  it("판매 미승인 실매장: menuOpen=false · isSampleStore=false", async () => {
    unapprovedRealStore();
    const r = await fetchStoreSummaryPublicShared(fake.sb as unknown as SupabaseClient, "demo");
    expect(r.body.meta).toMatchObject({ canSell: false, menuOpen: false, isSampleStore: false });
  });
  it("판매 승인 실매장: canSell=true · menuOpen=true", async () => {
    storeRow = { ...baseStore, store_kind: "real" };
    perm = { allowed_to_sell: true, sales_status: "approved" };
    menuOpen = true;
    const r = await fetchStoreSummaryPublicShared(fake.sb as unknown as SupabaseClient, "demo");
    expect(r.body.meta).toMatchObject({ canSell: true, menuOpen: true, isSampleStore: false });
  });
});

describe("legacy GET /api/stores/[slug] — 상품 조회는 메뉴 공개 기준", () => {
  async function get() {
    return getLegacyDetail(new Request("https://x.test"), { params: Promise.resolve({ slug: "demo" }) });
  }
  it("샘플: 상품 반환 + meta.canSell=false (주문 불가) + menuOpen/isSampleStore", async () => {
    sampleStore();
    const res = await get();
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.products).toHaveLength(1);
    expect(j.meta).toMatchObject({ canSell: false, menuOpen: true, isSampleStore: true });
    expect(j.store).not.toHaveProperty("store_kind");
    expect(fake.calls.some((c) => c.table === "store_products")).toBe(true);
  });
  it("판매 미승인 실매장: 상품 조회 안 함(빈 메뉴) — 기존 동작 유지", async () => {
    unapprovedRealStore();
    const j = await (await get()).json();
    expect(j.products).toEqual([]);
    expect(j.meta).toMatchObject({ canSell: false, menuOpen: false, isSampleStore: false });
    expect(fake.calls.some((c) => c.table === "store_products")).toBe(false);
  });
});
