/**
 * 5-C BR-02 — /api/stores/browse 요청당 정책 행 1회, 삽입 메타에 같은 scopeMeta 전달,
 * 탐색 선반 소스는 저장 스냅샷 경로(bypassCounter 없음)·선반 전용 조회·병렬, 선반 캐시 적중 시 내부 스냅샷 호출 0,
 * 꺼진 소스 1차는 조회하지 않음. viewer gate(비로그인·주소 없음 → 빈 목록)는 그대로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const originState = { gate: "ok" as "ok" | "login_required" };
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  syncStorePublicReadCachesWithSharedGeneration: () => Promise.resolve(),
}));
vi.mock("@/lib/stores/store-list-delivery-origin", () => ({
  resolveStoreListDeliveryOrigin: async () =>
    originState.gate === "ok"
      ? {
          source: "saved_address",
          userId: "user-1",
          addressId: "addr-1",
          placeId: null,
          lat: 14.56,
          lng: 121.03,
          addressIdentity: "x",
          canonicalLguId: null,
          cacheKeyPart: "addr:user-1",
        }
      : {
          source: "none",
          userId: null,
          addressId: null,
          placeId: null,
          lat: null,
          lng: null,
          addressIdentity: null,
          canonicalLguId: null,
          cacheKeyPart: "none",
        },
}));
vi.mock("@/lib/delivery/delivery-ops-settings", () => ({
  DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED: true,
  peekDeliveryRideTimeSource: () => "store",
  loadDeliveryRideTimeSource: async () => "store",
  loadDeliveryDistanceSettings: async () => ({
    policy: { enabled: false, source: "haversine", defaultMaxKm: null },
    overrides: { stores: {} },
  }),
}));

const shelfConfig = {
  enabled: true,
  exposurePrimarySlugs: ["mart"],
  sourceMode: "selected",
  sourcePrimarySlugs: ["mart", "restaurant", "hardware"],
  dataType: "rating",
  position: "page_top",
  afterN: 2,
  everyN: 2,
  maxShelvesPerPage: 1,
  maxItems: 6,
};
const policyRowsCalls = vi.fn();
vi.mock("@/lib/stores/product/stores-browse-scope-policy-db", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    listBrowseScopePolicyRows: async () => {
      policyRowsCalls();
      return [
        { scope_key: "mart", primary_slug: "mart", sub_slug: null, enabled: true, ad_enabled: null, coupon_enabled: null, presentation_mode: null, product_config: { browseShelf: shelfConfig } },
        { scope_key: "restaurant", primary_slug: "restaurant", sub_slug: null, enabled: false, ad_enabled: null, coupon_enabled: null, presentation_mode: null, product_config: null },
      ];
    },
  };
});

const snapCalls: Array<{ primary: string; sub: string; opts: Record<string, unknown> | undefined }> = [];
let inflightShelf = 0;
let maxInflightShelf = 0;
vi.mock("@/lib/stores/stores-browse-snapshot", () => ({
  tryLoadStoresBrowseFromSnapshot: async (
    _sb: unknown,
    ctx: { primary: string; sub: string },
    opts?: Record<string, unknown>
  ) => {
    snapCalls.push({ primary: ctx.primary, sub: ctx.sub, opts });
    const shelf = opts?.purpose === "discovery_shelf";
    if (shelf) {
      inflightShelf += 1;
      maxInflightShelf = Math.max(maxInflightShelf, inflightShelf);
      await new Promise((r) => setTimeout(r, 5));
      inflightShelf -= 1;
    }
    const store = (id: string) => ({ id, slug: id, nameKo: id, profileImageUrl: null, etaLabel: "", rating: 4, featuredItems: [] });
    return {
      body: { ok: true, stores: shelf ? [store(`${ctx.primary}-s1`), store("organic-1")] : [store("organic-1")], meta: {} },
      breakdown: {},
      snapshotVia: "counter_row",
      rpcWallMs: 0,
      transformMs: 0,
      dbBaseMs: 0,
      dbRelatedMs: 0,
      resultCount: 1,
      queryCount: 1,
      v2: { base_query_ms: 0, category_query_ms: 0, product_preview_query_ms: 0, review_summary_query_ms: 0, distance_sort_ms: 0, query_count: 1, selected_columns: "" },
    };
  },
}));
const insertionCalls: Array<{ scopeMeta: unknown }> = [];
vi.mock("@/lib/stores/composition/stores-composition-browse-insertion-meta", () => ({
  attachStoresBrowseInsertionMeta: async (_sb: unknown, body: unknown, scope: { scopeMeta: unknown }) => {
    insertionCalls.push({ scopeMeta: scope?.scopeMeta });
    return body;
  },
}));

import { GET } from "@/app/api/stores/browse/route";
import { invalidateStoresBrowseMemoryCache } from "@/lib/stores/stores-browse-response-cache";

async function call(qs: string) {
  const res = await GET(new Request(`http://localhost/api/stores/browse?${qs}`, { headers: { "accept-language": "ko" } }));
  return (await res.json()) as { stores: { id: string }[]; meta: { discoveryShelf?: { stores: { storeId: string }[] } | null; viewer_gate?: string } };
}

describe("5-C BR-02 browse route shelf cache / per-request dedup", () => {
  beforeEach(() => {
    invalidateStoresBrowseMemoryCache();
    snapCalls.length = 0;
    insertionCalls.length = 0;
    policyRowsCalls.mockClear();
    originState.gate = "ok";
    maxInflightShelf = 0;
  });

  it("미스: 정책 1회, 목록 스냅샷 1회(scopeMeta 전달) + 켜진 소스만 선반 조회(병렬·저장 스냅샷·선반 전용)", async () => {
    const body = await call("primary=mart&sub=meat");
    expect(policyRowsCalls).toHaveBeenCalledTimes(1);
    const main = snapCalls.filter((c) => c.opts?.purpose !== "discovery_shelf");
    const shelf = snapCalls.filter((c) => c.opts?.purpose === "discovery_shelf");
    expect(main).toHaveLength(1);
    expect(main[0]!.opts?.scopeMeta).toMatchObject({ primarySlug: "mart", subSlug: "meat" });
    expect(shelf.map((c) => c.primary).sort()).toEqual(["hardware", "mart"]);
    for (const c of shelf) {
      expect(c.opts?.bypassCounter).toBeUndefined();
      expect(c.sub).toBe("all");
    }
    expect(maxInflightShelf).toBe(2);
    expect(body.meta.discoveryShelf?.stores.map((s) => s.storeId)).toEqual(["mart-s1", "hardware-s1"]);
  });

  it("응답 캐시 적중: 내부 스냅샷 호출 0 (선반 캐시 적중), 정책 1회, 삽입 메타 1회 + 같은 scopeMeta", async () => {
    await call("primary=mart&sub=meat");
    snapCalls.length = 0;
    insertionCalls.length = 0;
    policyRowsCalls.mockClear();

    const body = await call("primary=mart&sub=meat");
    expect(snapCalls).toHaveLength(0);
    expect(policyRowsCalls).toHaveBeenCalledTimes(1);
    expect(insertionCalls).toHaveLength(1);
    expect(insertionCalls[0]!.scopeMeta).toMatchObject({ primarySlug: "mart", subSlug: "meat" });
    expect(body.meta.discoveryShelf?.stores.map((s) => s.storeId)).toEqual(["mart-s1", "hardware-s1"]);
  });

  it("다른 2차(같은 1차) 미스: 목록 스냅샷만, 선반은 캐시 적중(소스 호출 0)", async () => {
    await call("primary=mart&sub=meat");
    snapCalls.length = 0;
    await call("primary=mart&sub=seafood");
    expect(snapCalls).toHaveLength(1);
    expect(snapCalls[0]!.opts?.purpose).not.toBe("discovery_shelf");
  });

  it("무효화 후에는 선반 다시 계산", async () => {
    await call("primary=mart&sub=meat");
    invalidateStoresBrowseMemoryCache("restaurant");
    snapCalls.length = 0;
    await call("primary=mart&sub=seafood");
    expect(snapCalls.filter((c) => c.opts?.purpose === "discovery_shelf")).toHaveLength(2);
  });

  it("fresh 우회 요청은 선반 캐시를 쓰지 않는다", async () => {
    await call("primary=mart&sub=meat");
    snapCalls.length = 0;
    await call("primary=mart&sub=meat&fresh=1");
    expect(snapCalls.filter((c) => c.opts?.purpose === "discovery_shelf")).toHaveLength(2);
  });

  it("viewer gate 유지: 비로그인 → 빈 목록, 정책·스냅샷 호출 없음", async () => {
    originState.gate = "login_required";
    const body = await call("primary=mart&sub=meat");
    expect(body.stores).toEqual([]);
    expect(body.meta.viewer_gate).toBe("login_required");
    expect(snapCalls).toHaveLength(0);
    expect(policyRowsCalls).not.toHaveBeenCalled();
  });
});
