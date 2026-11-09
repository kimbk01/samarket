/**
 * `/api/stores/[slug]/menus` — 숨김 매장 메뉴 사본 노출 결함(2026-11-03 운영 실측: 숨김 4곳 200) 동작 테스트.
 * 공용 판정(숨김 = not_found)이 메뉴 사본(snapshot counter row)보다 먼저 —
 * 다른 사람은 사본이 있어도 404, 그 매장 사장님만 DB 함수(본인 판정)로 200.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  viewer: null as string | null,
  publicVisible: false,
  snapshotCalls: 0,
  rpcArgs: [] as Array<Record<string, unknown>>,
  /** 관리자 미리보기 판정 결과 (설계 v3.2 §3-4-3) — null = 관리자 아님 */
  adminViewer: null as string | null,
}));

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => h.viewer }));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  syncStorePublicReadCachesWithSharedGeneration: async () => {},
}));
vi.mock("@/lib/stores/get-approved-store-by-slug", () => ({
  STORE_SELECT_MENUS_STORE: "id, slug, store_name, approval_status, is_visible, menu_sold_out_bottom",
  getApprovedStoreBySlug: async () =>
    h.publicVisible
      ? { ok: true, store: { id: "s1", slug: "hidden-shop", store_name: "Hidden" } }
      : { ok: false, reason: "not_found" },
  /** 관리자 미리보기 판정 — 활성 관리자만 열림(사장님 id 를 함께 준다) */
  getStoreBySlugForViewer: async (_sb: unknown, _slug: string, _cols: string, viewer: string | null) =>
    viewer && viewer === h.adminViewer
      ? {
          ok: true,
          store: { id: "s1", slug: "hidden-shop", store_name: "Hidden", owner_user_id: OWNER },
          ownerHiddenPreview: false,
          adminPreview: true,
          publiclyVisible: false,
        }
      : { ok: false, reason: "not_found" },
}));

const STALE_COPY_BODY = {
  ok: true,
  store: { id: "s1", slug: "hidden-shop", store_name: "Hidden", menu_sold_out_bottom: false },
  products: [{ id: "p1" }],
  recommendedProductIds: [],
  popularProductIds: [],
  recommendedProducts: [],
  popularProducts: [],
  categories: [],
  meta: { canSell: true, source: "supabase" },
};
vi.mock("@/lib/stores/store-menus-snapshot", () => ({
  STORE_MENUS_SNAPSHOT_RPC: "get_store_menus_snapshot",
  /** 숨기기 전에 만들어진 메뉴 사본 — 숨김 매장에서는 절대 읽히면 안 됨 */
  tryLoadStoreMenusCatalogFromSnapshot: async () => {
    h.snapshotCalls += 1;
    return { body: STALE_COPY_BODY, breakdown: { round_trips: 1, db_ms: 1, snapshot_via: "counter_row" } };
  },
}));

const OWNER = "owner-uid";
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({
    /** DB 함수 = 승인 + (노출 또는 p_user_id = 사장님) */
    rpc: async (_name: string, args: Record<string, unknown>) => {
      h.rpcArgs.push(args);
      if (args.p_user_id !== OWNER) return { data: null, error: null };
      return {
        data: {
          store: { id: "s1", slug: "hidden-shop", store_name: "Hidden", menu_sold_out_bottom: false },
          products: [
            {
              id: "p1",
              title: "메뉴",
              price: 100,
              product_status: "active",
              sort_order: 0,
              store_menu_sections: null,
            },
          ],
          popular_stats: [],
          commerce: {},
          meta: { favorite_count: 0, recent_order_count: 0, viewer_favorited: false, can_sell: true },
          menu_version: "default",
          updated_at: new Date().toISOString(),
        },
        error: null,
      };
    },
    from: () => {
      throw new Error("매장 행 직접 조회 없음 — 본인 판정은 DB 함수가 한다");
    },
  }),
}));
vi.mock("@/lib/stores/load-store-commerce-meta-cached", () => ({
  loadStoreCommerceMetaCached: async () => ({ favoriteCount: 0, recentOrderCount: 0, viewerFavorited: false }),
}));

import { GET as getMenus } from "@/app/api/stores/[slug]/menus/route";
import { resetStoreMenusPublicServerCacheForTests } from "@/lib/stores/store-menus-public-server-cache";

async function call(): Promise<{ status: number; json: Record<string, unknown>; cacheControl: string | null }> {
  const res = await getMenus(new Request("http://x/api/stores/hidden-shop/menus"), {
    params: Promise.resolve({ slug: "hidden-shop" }),
  });
  return {
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
    cacheControl: res.headers.get("cache-control"),
  };
}

describe("menus — 숨김 매장 메뉴 사본 차단 · 사장님 본인만 열람", () => {
  beforeEach(() => {
    h.viewer = null;
    h.publicVisible = false;
    h.snapshotCalls = 0;
    h.rpcArgs = [];
    h.adminViewer = null;
    resetStoreMenusPublicServerCacheForTests();
  });

  it("다른 사람: 숨김 매장은 사본이 있어도 404 · 사본을 읽지 않음", async () => {
    h.viewer = "someone-else";
    const r = await call();
    expect(r.status).toBe(404);
    expect((r.json.products as unknown[]).length).toBe(0);
    expect(h.snapshotCalls).toBe(0);
    expect(r.cacheControl).toBe("private, no-store");
  });

  it("사장님 본인: DB 함수(p_user_id = 본인) 1번으로 200 · 숨김 표시 · 공용 캐시 안 씀", async () => {
    h.viewer = OWNER;
    const r = await call();
    expect(r.status).toBe(200);
    expect((r.json.meta as Record<string, unknown>).owner_hidden_preview).toBe(true);
    expect(h.rpcArgs).toEqual([
      { p_store_slug: "hidden-shop", p_user_id: OWNER, p_menu_version: "default" },
    ]);
    expect(h.snapshotCalls).toBe(0);
    expect(r.cacheControl).toBe("private, no-store");
  });

  it("관리자 미리보기: 관리자 확인 뒤 DB 함수(p_user_id = 사장님)로 200 · 찜 false · 공용 캐시 안 씀", async () => {
    h.viewer = "admin-uid";
    h.adminViewer = "admin-uid";
    const r = await call();
    expect(r.status).toBe(200);
    const meta = r.json.meta as Record<string, unknown>;
    expect(meta.admin_preview).toBe(true);
    expect(meta.admin_preview_public_visible).toBe(false);
    expect(meta.viewer_favorited).toBe(false);
    expect(meta.owner_hidden_preview).toBeUndefined();
    // 첫 호출 = 본인 미리보기 시도(p_user_id = 관리자 → 빈 결과), 둘째 = 관리자 확인 뒤 사장님 id
    expect(h.rpcArgs.map((a) => a.p_user_id)).toEqual(["admin-uid", OWNER]);
    expect(h.snapshotCalls).toBe(0);
    expect(r.cacheControl).toBe("private, no-store");
  });

  it("노출 매장: 지금처럼 공용 사본 경로", async () => {
    h.viewer = "someone-else";
    h.publicVisible = true;
    const r = await call();
    expect(r.status).toBe(200);
    expect(h.snapshotCalls).toBe(1);
    expect(h.rpcArgs).toHaveLength(0);
  });
});
