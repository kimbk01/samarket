/**
 * 5-C BR-01 — 오래된 저장 행이 실시간 순위 매장을 담지 못하면 그 payload 를 쓰지 않고 원본 RPC 로 1회 재조회.
 * 5-C BR-02 — 선반 소스 조회(purpose=discovery_shelf)는 삽입 메타·인기 메뉴 보강을 계산하지 않고,
 * 목록 조회는 라우트가 넘긴 scopeMeta 를 삽입 메타에 그대로 전달.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Payload = { ok: true; tag: string; store_rows: { id: string }[] };

vi.mock("@/lib/stores/stores-browse-snapshot-assemble", () => ({
  parseStoresBrowseSnapshotRpcData: (data: unknown) => data,
  earlyBrowseBodyFromRpcPayload: () => null,
  storesBrowseDbBundleFromRpcPayload: (payload: Payload) => ({
    taxonomySlice: { categoryId: "cat-mart", resolvedTopicId: "topic-meat" },
    storeRowsRaw: payload.store_rows,
    tag: payload.tag,
    distanceSortMs: 0,
  }),
}));

vi.mock("@/lib/stores/discovery/store-discovery-ranking-authority", () => ({
  isStoreDiscoveryRankingAuthorityNew: () => true,
  logStoreDiscoveryAuthorityRuntime: () => {},
  resolveStoreDiscoveryRankingAuthority: () => "new",
}));

const ranking = vi.fn(async () => ({ ok: true, filter: { rows: [{ id: "hanwoo" }] } }));
vi.mock("@/lib/stores/discovery/load-store-discovery-ranked-live", () => ({
  loadBrowseDiscoveryRankedForLive: () => ranking(),
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
    assembleStoresBrowseResponse: (_ctx: unknown, bundle: { tag: string }, filter: { rows: { id: string }[] }) => ({
      body: { ok: true, stores: filter.rows, meta: { tag: bundle.tag } },
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
const enrich = vi.fn(async () => ({ enrichDbMs: 0, queryCount: 0 }));
vi.mock("@/lib/stores/enrich-browse-stores-platform-popular", () => ({
  enrichBrowseStoresWithPlatformPopular: () => enrich(),
}));
const insertion = vi.fn(async (_sb: unknown, body: unknown, _scope: unknown) => body);
vi.mock("@/lib/stores/composition/stores-composition-browse-insertion-meta", () => ({
  attachStoresBrowseInsertionMeta: (sb: unknown, body: unknown, scope: unknown) => insertion(sb, body, scope),
}));
const scheduleRefresh = vi.fn();
const refreshKey = vi.fn();
vi.mock("@/lib/stores/stores-browse-snapshot-refresh", () => ({
  scheduleStoresBrowseSnapshotRefresh: (p: string, s: string) => scheduleRefresh(p, s),
  refreshStoresBrowseSnapshotKey: (_sb: unknown, p: string, s: string) => refreshKey(p, s),
}));
vi.mock("@/lib/stores/stores-browse-snapshot-hotpath-analysis", () => ({
  logStoresBrowseMonolithAnalysis: () => {},
  logStoresBrowseSnapshotRpcDesignOnce: () => {},
}));
vi.mock("@/lib/stores/stores-browse-snapshot-regression-guard", () => ({
  evaluateStoresBrowseRegressionGuards: () => {},
}));

import {
  rankedStoreIdsMissingFromPayload,
  tryLoadStoresBrowseFromSnapshot,
} from "@/lib/stores/stores-browse-snapshot";

function counterSb(row: { payload_json: Payload; updated_at: string }) {
  const calls = { counterRead: 0, rpc: 0, upsert: 0 };
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => {
    calls.counterRead += 1;
    return { data: row, error: null };
  };
  chain.upsert = async () => {
    calls.upsert += 1;
    return { error: null };
  };
  const sb = {
    from: () => chain,
    rpc: async () => {
      calls.rpc += 1;
      return { data: { ok: true, tag: "rpc", store_rows: [{ id: "hanwoo" }] }, error: null };
    },
  };
  return { sb, calls };
}

const ctx = {
  primary: "mart",
  sub: "meat",
  subRaw: "meat",
  wantsAllSubs: false,
  limit: 20,
  page: 1,
  sort: "rating_count",
  district: null,
  regionQ: "",
  cityQ: "",
  deliveryDistancePolicy: { enabled: false },
  origin: { lat: 14.56, lng: 121.03, source: "saved_address", canonicalLguId: null, cacheGeoPart: "g" },
};

const STALE = new Date(Date.now() - 1000 * 60 * 60 * 24 * 150).toISOString();

describe("5-C BR-01 stale snapshot vs live ranking", () => {
  beforeEach(() => {
    ranking.mockClear();
    enrich.mockClear();
    insertion.mockClear();
    scheduleRefresh.mockClear();
    refreshKey.mockReset();
  });

  it("missing helper: store_rows 에 없는 순위 매장 id 만", () => {
    expect(rankedStoreIdsMissingFromPayload({ ok: true, store_rows: [{ id: "a" }] }, [{ id: "a" }, { id: "b" }])).toEqual(["b"]);
    expect(rankedStoreIdsMissingFromPayload({ ok: true }, [])).toEqual([]);
  });

  it("오래된 행이 순위 매장을 못 담음 → (1차,2차) 원본 재조회 1회, 재조회 payload 로 조립", async () => {
    refreshKey.mockResolvedValue({ ok: true, tag: "fresh", store_rows: [{ id: "hanwoo" }] });
    const { sb } = counterSb({ payload_json: { ok: true, tag: "stale", store_rows: [] }, updated_at: STALE });
    const r = await tryLoadStoresBrowseFromSnapshot(sb as never, ctx as never);
    expect(refreshKey).toHaveBeenCalledTimes(1);
    expect(refreshKey).toHaveBeenCalledWith("mart", "meat");
    expect((r!.body as unknown as { meta: { tag: string } }).meta.tag).toBe("fresh");
    expect(r!.snapshotVia).toBe("unified_rpc");
    expect(scheduleRefresh).not.toHaveBeenCalled();
  });

  it("재조회 결과도 불일치여도 다시 재조회하지 않는다 (무한 재시도 없음)", async () => {
    refreshKey.mockResolvedValue({ ok: true, tag: "fresh-still-missing", store_rows: [] });
    const { sb } = counterSb({ payload_json: { ok: true, tag: "stale", store_rows: [] }, updated_at: STALE });
    const r = await tryLoadStoresBrowseFromSnapshot(sb as never, ctx as never);
    expect(refreshKey).toHaveBeenCalledTimes(1);
    expect((r!.body as unknown as { meta: { tag: string } }).meta.tag).toBe("fresh-still-missing");
    expect(ranking).toHaveBeenCalledTimes(2);
  });

  it("오래된 행이어도 순위 매장을 모두 담으면 그대로 사용 + 같은 (1차,2차) 백그라운드 갱신 예약", async () => {
    const { sb, calls } = counterSb({ payload_json: { ok: true, tag: "stale-ok", store_rows: [{ id: "hanwoo" }] }, updated_at: STALE });
    const r = await tryLoadStoresBrowseFromSnapshot(sb as never, ctx as never);
    expect(refreshKey).not.toHaveBeenCalled();
    expect(calls.rpc).toBe(0);
    expect((r!.body as unknown as { meta: { tag: string } }).meta.tag).toBe("stale-ok");
    expect(scheduleRefresh).toHaveBeenCalledWith("mart", "meat");
    expect(ranking).toHaveBeenCalledTimes(1);
  });

  it("신선한 행은 불일치 판정·재조회 없음 (요청당 순위 1회)", async () => {
    const { sb } = counterSb({ payload_json: { ok: true, tag: "fresh-row", store_rows: [] }, updated_at: new Date().toISOString() });
    const r = await tryLoadStoresBrowseFromSnapshot(sb as never, { ...ctx, sub: "fresh-sub" } as never);
    expect(refreshKey).not.toHaveBeenCalled();
    expect(scheduleRefresh).not.toHaveBeenCalled();
    expect((r!.body as unknown as { meta: { tag: string } }).meta.tag).toBe("fresh-row");
    expect(ranking).toHaveBeenCalledTimes(1);
  });
});

describe("5-C BR-02 snapshot load options", () => {
  beforeEach(() => {
    enrich.mockClear();
    insertion.mockClear();
    refreshKey.mockReset();
  });

  it("목록 조회: 라우트 scopeMeta 를 삽입 메타에 전달 (정책 재조회 없음)", async () => {
    const scopeMeta = { primarySlug: "mart", subSlug: "meat", enabled: true };
    const { sb } = counterSb({ payload_json: { ok: true, tag: "x", store_rows: [{ id: "hanwoo" }] }, updated_at: new Date().toISOString() });
    await tryLoadStoresBrowseFromSnapshot(sb as never, { ...ctx, sub: "opt-a" } as never, { scopeMeta: scopeMeta as never });
    expect(insertion).toHaveBeenCalledTimes(1);
    expect((insertion.mock.calls[0]![2] as { scopeMeta: unknown }).scopeMeta).toBe(scopeMeta);
    expect(enrich).toHaveBeenCalledTimes(1);
  });

  it("선반 소스 조회: 삽입 메타·인기 메뉴 보강 0회, 오래된 행이어도 재조회 없음", async () => {
    const { sb } = counterSb({ payload_json: { ok: true, tag: "shelf", store_rows: [] }, updated_at: STALE });
    const r = await tryLoadStoresBrowseFromSnapshot(sb as never, { ...ctx, sub: "all", wantsAllSubs: true } as never, {
      purpose: "discovery_shelf",
    });
    expect(insertion).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
    expect(refreshKey).not.toHaveBeenCalled();
    expect(r!.body.stores).toEqual([{ id: "hanwoo" }]);
  });
});
