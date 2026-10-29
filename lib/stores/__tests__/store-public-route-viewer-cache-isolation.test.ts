/**
 * CRT-01 — `/api/stores/[slug]/summary`·`/menus` 의 slug 단위 서버 캐시는 보는 사람과 무관한 본문만 담고,
 * 본인 매장·주문 가능·찜 여부는 요청마다 그 사람 기준으로 합성해야 한다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/** 요청별 로그인 사용자 — 동시 요청도 각자 값을 보도록 AsyncLocalStorage 로 격리 */
const viewer = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- vi.hoisted 안에서는 import 불가
  const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
  const als = new AsyncLocalStorage<string | null>();
  const state = { current: null as string | null, als, read: async () => als.getStore() ?? state.current };
  return state;
});
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: () => viewer.read() }));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: () => viewer.read(),
}));

const snapshotViewerArgs: (string | null)[] = [];
vi.mock("@/lib/stores/store-menus-snapshot", () => ({
  tryLoadStoreMenusCatalogFromSnapshot: async (_sb: unknown, slug: string, viewerId: string | null) => {
    snapshotViewerArgs.push(viewerId);
    return {
      body: {
        ok: true,
        store: { id: "store-1", slug, store_name: "Demo", menu_sold_out_bottom: false },
        products: [],
        recommendedProductIds: [],
        popularProductIds: [],
        recommendedProducts: [],
        popularProducts: [],
        categories: [],
        meta: { canSell: true, source: "supabase", favorite_count: 3, viewer_favorited: viewerId === "fan-uid" },
      },
      breakdown: { round_trips: 1, db_ms: 1, snapshot_via: "counter_row" },
    };
  },
}));

vi.mock("@/lib/stores/get-approved-store-by-slug", () => ({
  STORE_SELECT_SUMMARY: "*",
  STORE_SELECT_MENUS_STORE: "*",
  getApprovedStoreBySlug: async () => ({
    ok: true,
    store: { id: "store-1", slug: "demo", store_name: "Demo", owner_user_id: "owner-uid" },
  }),
  loadStoreCommerceMeta: async (_sb: unknown, _storeId: string, viewerId: string | null) => ({
    favoriteCount: 3,
    recentOrderCount: 0,
    viewerFavorited: viewerId === "fan-uid",
    canSell: true,
  }),
}));

function fakeSb(): unknown {
  const chain: unknown = new Proxy(function () {}, {
    get(_t, p) {
      if (p === "then") return undefined;
      if (p === "maybeSingle" || p === "single")
        return async () => ({ data: { allowed_to_sell: true, sales_status: "approved", role: "user" }, error: null });
      return () => chain;
    },
    apply() {
      return chain;
    },
  });
  return { from: () => chain, rpc: async () => ({ data: null, error: null }) };
}
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fakeSb() }));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  syncStorePublicReadCachesWithSharedGeneration: async () => {},
}));
vi.mock("@/lib/auth/admin-membership", () => ({
  hasActiveAdminMembershipOrLegacyRole: async () => false,
}));

import { GET as getSummary } from "@/app/api/stores/[slug]/summary/route";
import { GET as getMenus } from "@/app/api/stores/[slug]/menus/route";
import { resetStoreSummaryPublicServerCacheForTests } from "@/lib/stores/store-summary-public-server-cache";
import { resetStoreMenusPublicServerCacheForTests } from "@/lib/stores/store-menus-public-server-cache";
import { resetStoreCommerceMetaCachesForTests } from "@/lib/stores/load-store-commerce-meta-cached";

type Json = { meta: Record<string, unknown>; store: Record<string, unknown> | null };

async function callSummary(): Promise<{ status: number; json: Json; cacheHit: string | null }> {
  const res = await getSummary(new Request("http://x/api/stores/demo/summary"), {
    params: Promise.resolve({ slug: "demo" }),
  });
  return { status: res.status, json: (await res.json()) as Json, cacheHit: res.headers.get("x-cache-hit") };
}

async function callMenus(): Promise<Json> {
  const res = await getMenus(new Request("http://x/api/stores/demo/menus"), {
    params: Promise.resolve({ slug: "demo" }),
  });
  return (await res.json()) as Json;
}

afterEach(() => {
  resetStoreSummaryPublicServerCacheForTests();
  resetStoreMenusPublicServerCacheForTests();
  resetStoreCommerceMetaCachesForTests();
  snapshotViewerArgs.length = 0;
});

describe("CRT-01 /summary viewer fields are per request", () => {
  it("owner fills the cache, then a customer gets customer viewer fields (and vice versa)", async () => {
    viewer.current = "owner-uid";
    const owner = await callSummary();
    viewer.current = "customer-uid";
    const customer = await callSummary();
    viewer.current = null;
    const guest = await callSummary();
    viewer.current = "owner-uid";
    const ownerAgain = await callSummary();

    expect(owner.json.meta).toMatchObject({ viewer_is_owner: true, can_order_store: false });
    expect(customer.json.meta).toMatchObject({ viewer_is_owner: false, can_order_store: true });
    expect(guest.json.meta).toMatchObject({ viewer_is_owner: false, can_order_store: true });
    expect(ownerAgain.json.meta).toMatchObject({ viewer_is_owner: true, can_order_store: false });
    expect(customer.json.store).not.toHaveProperty("owner_user_id");
    expect(customer.json.meta.canSell).toBe(true);
  });

  it("concurrent owner + customer requests (shared single-flight) still get their own viewer fields", async () => {
    const reqs = ["owner-uid", "customer-uid"].map((v) =>
      viewer.als.run(v, () =>
        getSummary(new Request("http://x/api/stores/demo/summary"), {
          params: Promise.resolve({ slug: "demo" }),
        })
      )
    );
    // 두 요청 모두 같은 slug single-flight 에 합류 — viewer 필드는 각 요청 기준.
    const [a, b] = await Promise.all(reqs);
    const ja = (await a.json()) as Json;
    const jb = (await b.json()) as Json;
    expect(ja.meta.viewer_is_owner).toBe(true);
    expect(jb.meta.viewer_is_owner).toBe(false);
  });
});

describe("CRT-01 /menus viewer_favorited is per request", () => {
  it("a fan's favorite state is not served to the next viewer from the slug memory cache", async () => {
    viewer.current = "fan-uid";
    const fan = await callMenus();
    viewer.current = "other-uid";
    const other = await callMenus();
    viewer.current = null;
    const guest = await callMenus();
    viewer.current = "fan-uid";
    const fanAgain = await callMenus();

    expect(fan.meta.viewer_favorited).toBe(true);
    expect(other.meta.viewer_favorited).toBe(false);
    /** 묶음4 R-1 — 비로그인은 메뉴 본문 대신 게이트(공용 캐시 본문·찜 값 노출 없음) */
    expect(guest.meta.viewer_gate).toBe("login_required");
    expect(guest.store).toBeNull();
    expect(guest.meta.viewer_favorited).toBeUndefined();
    expect(fanAgain.meta.viewer_favorited).toBe(true);
    // 공용 본문은 anon 스냅샷 1회 → 이후 route memory hit
    expect(snapshotViewerArgs).toEqual([null]);
  });
});
