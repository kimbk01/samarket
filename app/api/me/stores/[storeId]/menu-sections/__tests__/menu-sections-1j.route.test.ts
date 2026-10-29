/**
 * 1-J — 메뉴 구역 쓰기: PRD-09 오너 상품 목록 캐시 무효화 · OPS-02 공용 세대 bump.
 * + 배너·공지 쓰기 라우트의 OPS-02 bump 계약.
 */
import fs from "node:fs";
import path from "node:path";
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

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: async () => ({ ok: true, profile: {} }),
  requirePhoneVerified: async () => ({ ok: true, profile: {} }),
}));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async () => ({ ok: true, store: { id: "store-1", approval_status: "approved" } }),
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

import { DELETE, PATCH } from "@/app/api/me/stores/[storeId]/menu-sections/[sectionId]/route";

const ctx = { params: Promise.resolve({ storeId: "store-1", sectionId: "sec-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeStoreSupabase((c) => handler(c));
  handler = (call) => {
    if (call.op === "select" && call.single) return { data: { id: "sec-1", is_hidden: true }, error: null };
    return { data: null, error: null };
  };
});

describe("menu-sections writes — PRD-09 / OPS-02", () => {
  it("PATCH (hide section) invalidates owner list cache and bumps shared generation", async () => {
    const res = await PATCH(
      new Request("https://x.test", { method: "PATCH", body: JSON.stringify({ is_hidden: true }) }) as never,
      ctx
    );
    expect(res.status).toBe(200);
    expect(invalidateOwnerList).toHaveBeenCalledWith("store-1");
    expect(bump).toHaveBeenCalledWith("owner_store.menu_section_update");
  });

  it("DELETE invalidates owner list cache and bumps shared generation", async () => {
    const res = await DELETE(new Request("https://x.test", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(invalidateOwnerList).toHaveBeenCalledWith("store-1");
    expect(bump).toHaveBeenCalledWith("owner_store.menu_section_delete");
  });
});

describe("OPS-02 owner write routes bump the shared public cache generation", () => {
  const root = process.cwd();
  const cases: Array<[string, string[]]> = [
    // 3-C §9-3 — 상품·메뉴 섹션 저장 본문은 오너·관리자 샘플 공용 코어로 이동 (오너 라우트는 가드 후 코어 호출)
    ["lib/stores/owner-catalog/products-core.server.ts", ["owner_store.product_create", "owner_store.product_update"]],
    ["lib/stores/owner-catalog/menu-sections-core.server.ts", ["owner_store.menu_section_create"]],
    ["app/api/me/stores/[storeId]/banners/route.ts", ["owner_store.banner_create"]],
    ["app/api/me/stores/[storeId]/banners/[bannerId]/route.ts", ["owner_store.banner_update", "owner_store.banner_delete"]],
    ["app/api/me/stores/[storeId]/notices/route.ts", ["owner_store.notice_create"]],
    ["app/api/me/stores/[storeId]/notices/[noticeId]/route.ts", ["owner_store.notice_update", "owner_store.notice_delete"]],
  ];
  for (const [rel, keys] of cases) {
    it(rel, () => {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      for (const k of keys) expect(src).toContain(`bumpStorePublicSharedCacheGeneration("${k}")`);
    });
  }
});
