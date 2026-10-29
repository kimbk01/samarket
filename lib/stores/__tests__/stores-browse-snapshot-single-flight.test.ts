/**
 * DSC-01 — browse snapshot 단일 비행은 사용자 무관 payload 읽기만 공유하고,
 * origin·sort·page 로 조립하는 결과는 호출자별로 독립이어야 한다.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stores/stores-browse-snapshot-assemble", () => ({
  parseStoresBrowseSnapshotRpcData: (data: unknown) => data,
  earlyBrowseBodyFromRpcPayload: () => null,
  storesBrowseDbBundleFromRpcPayload: () => ({
    taxonomySlice: { categoryId: "cat-food", resolvedTopicId: "topic-korean" },
    storeRowsRaw: [],
    distanceSortMs: 0,
  }),
}));

vi.mock("@/lib/stores/discovery/store-discovery-ranking-authority", () => ({
  isStoreDiscoveryRankingAuthorityNew: () => true,
  logStoreDiscoveryAuthorityRuntime: () => {},
  resolveStoreDiscoveryRankingAuthority: () => "new",
}));

vi.mock("@/lib/stores/discovery/load-store-discovery-ranked-live", () => ({
  loadBrowseDiscoveryRankedForLive: async (_sb: unknown, args: { originLat: number }) => ({
    ok: true,
    filter: { rows: [{ id: `store-near-${args.originLat}` }] },
  }),
}));

vi.mock("@/lib/stores/stores-browse-build", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const passFilter = (_ctx: unknown, f: unknown) => f;
  return {
    ...real,
    applyBrowseSubFilterContractToPrefetchedFilter: (_ctx: unknown, _slice: unknown, f: unknown) => f,
    applyNewAuthorityFastPrepSortToBrowseFilter: passFilter,
    applyNewAuthorityDistanceSortToBrowseFilter: passFilter,
    applyNewAuthorityRatingConfidenceToBrowseFilter: passFilter,
    applyPopularityWindowOverlayToBrowseFilter: passFilter,
    assembleStoresBrowseResponse: (
      ctx: { sort: string; page: number; origin: { cacheGeoPart: string } },
      _bundle: unknown,
      filter: { rows: { id: string }[] }
    ) => ({
      body: {
        ok: true,
        stores: filter.rows,
        meta: { sort: ctx.sort, page: ctx.page, geo: ctx.origin.cacheGeoPart },
      },
      transformMs: 0,
      dbBaseMs: 0,
      dbRelatedMs: 0,
      resultCount: filter.rows.length,
    }),
  };
});

vi.mock("@/lib/stores/store-discovery-popular-store", () => ({
  loadStoreCompletedOrderCount30dMapWithStatus: async () => ({ counts: new Map(), status: "ok" }),
  resolveStorePopularitySinceIso: () => "2026-01-01T00:00:00.000Z",
}));
vi.mock("@/lib/stores/store-rating-confidence-policy", () => ({
  loadStoreRatingConfidencePolicy: async () => ({ policy: null, status: "ok" }),
}));
vi.mock("@/lib/delivery/service-area/load-store-service-area-runtime-map", () => ({
  loadStoreServiceAreaRuntimeMap: async () => new Map(),
}));
vi.mock("@/lib/stores/enrich-browse-stores-platform-popular", () => ({
  enrichBrowseStoresWithPlatformPopular: async () => ({ enrichDbMs: 0, queryCount: 0 }),
}));
vi.mock("@/lib/stores/composition/stores-composition-browse-insertion-meta", () => ({
  attachStoresBrowseInsertionMeta: async (_sb: unknown, body: unknown) => body,
}));
vi.mock("@/lib/stores/stores-browse-snapshot-refresh", () => ({
  scheduleStoresBrowseSnapshotRefresh: () => {},
  /** 5-C — 오래된 저장 행 불일치 재조회용 (bypassCounter 경로에서는 호출되지 않음) */
  refreshStoresBrowseSnapshotKey: async () => null,
}));
vi.mock("@/lib/stores/stores-browse-snapshot-hotpath-analysis", () => ({
  logStoresBrowseMonolithAnalysis: () => {},
  logStoresBrowseSnapshotRpcDesignOnce: () => {},
}));
vi.mock("@/lib/stores/stores-browse-snapshot-regression-guard", () => ({
  evaluateStoresBrowseRegressionGuards: () => {},
}));

import { tryLoadStoresBrowseFromSnapshot } from "@/lib/stores/stores-browse-snapshot";

function slowSnapshotSb() {
  const calls = { rpc: 0, upsert: 0 };
  const sb = {
    rpc: () => {
      calls.rpc += 1;
      return new Promise((res) => setTimeout(() => res({ data: { ok: true }, error: null }), 20));
    },
    from: () => ({
      upsert: async () => {
        calls.upsert += 1;
        return { error: null };
      },
    }),
  };
  return { sb, calls };
}

const base = {
  primary: "food",
  sub: "korean",
  subRaw: "korean",
  wantsAllSubs: false,
  limit: 20,
  district: null,
  regionQ: null,
  cityQ: null,
  deliveryDistancePolicy: { enabled: true },
};

describe("DSC-01 browse snapshot single-flight", () => {
  it("concurrent callers with different origin/sort/page get independent results; RPC payload is fetched once", async () => {
    const userA = {
      ...base,
      sort: "distance",
      page: 1,
      origin: { lat: 14.55, lng: 121.02, source: "member_address", canonicalLguId: "lgu-A", cacheGeoPart: "A" },
    };
    const userB = {
      ...base,
      sort: "rating",
      page: 2,
      origin: { lat: 10.31, lng: 123.89, source: "member_address", canonicalLguId: "lgu-B", cacheGeoPart: "B" },
    };
    const { sb, calls } = slowSnapshotSb();
    const [ra, rb] = await Promise.all([
      tryLoadStoresBrowseFromSnapshot(sb as never, userA as never, { bypassCounter: true }),
      tryLoadStoresBrowseFromSnapshot(sb as never, userB as never, { bypassCounter: true }),
    ]);

    expect(calls.rpc).toBe(1);
    expect(calls.upsert).toBe(1);
    expect(ra).not.toBe(rb);
    const metaA = (ra!.body as { meta: Record<string, unknown> }).meta;
    const metaB = (rb!.body as { meta: Record<string, unknown> }).meta;
    expect(metaA).toMatchObject({ sort: "distance", page: 1, geo: "A" });
    expect(metaB).toMatchObject({ sort: "rating", page: 2, geo: "B" });
    expect(ra!.body.stores).toEqual([{ id: "store-near-14.55" }]);
    expect(rb!.body.stores).toEqual([{ id: "store-near-10.31" }]);
  });
});
