/**
 * v4 W2 서버 병목 — PERF-02 wave 병렬(결과 동일), PERF-06 서비스 영역 재사용, PERF-07 상품 상한,
 * PERF-10 90일 주문 수 캐시, PERF-14 배너 stores 조회 1회, PERF-15 taxonomy 캐시·세대 purge,
 * PERF-16 고객 GET 읽기 전용 정책 조회, PERF-22 실제 왕복 수, DB-05 unknown 스냅샷 미저장.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryShadowWaveFetcher,
  fillShadowRankedViaWaves,
  type ShadowWaveFetchFn,
  type StoreDiscoveryShadowCandidate,
} from "@/lib/stores/discovery/store-discovery-shadow-ranked";
import { shouldPersistStoresBrowseSnapshotPayload, reuseOrLoadBrowseServiceAreaMap } from "@/lib/stores/stores-browse-snapshot";
import {
  clearStoreTaxonomyPublicServerCache,
  loadStoreTaxonomyPublicWithCache,
  peekStoreTaxonomyPublicServerCache,
} from "@/lib/stores/store-taxonomy-public-server-cache";
import { purgeAllStorePublicServerMemoryCaches } from "@/lib/stores/store-public-server-memory-purge";
import {
  clearStoreRecentOrderCountCache,
  loadStoreRecentOrderCount90dCached,
} from "@/lib/stores/store-recent-order-count-cache";
import { loadEligibleBannerStoreRows } from "@/lib/stores/advertising/load-banner-store-eligibility";
import { excludeViewerOutOfRangeBannerStores } from "@/lib/stores/advertising/banner-viewer-serviceability";
import { markSampleStoreBannerSlides } from "@/lib/stores/advertising/mark-sample-store-banner-slides";
import { loadResolvedCompositionPolicyRowsReadOnly } from "@/lib/stores/composition/stores-composition-policy-db";
import { countSupabaseRoundTrips } from "@/lib/stores/supabase-round-trip-counter";
import { resolveHomeFeedProductFetchCap } from "@/lib/stores/store-home-feed-product-fetch-cap";
import { createFakeStoreSupabase } from "@/lib/stores/__tests__/helpers/fake-store-supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoresBrowseSnapshotPayloadJson } from "@/lib/stores/stores-browse-snapshot-assemble";

const STATES = ["ORDERABLE", "IN_BREAK", "PREPARING", "CLOSED", "UNKNOWN", null] as const;

function pool(n: number): StoreDiscoveryShadowCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${String(i).padStart(3, "0")}`,
    slug: `s${i}`,
    district: i % 3 === 0 ? "Makati" : "Pasig",
    rating_avg: 3 + (i % 5) * 0.4,
    review_count: i * 3,
    delivery_available: i % 7 !== 0,
    discovery_schedule_state: STATES[i % STATES.length]!,
    completed_orders_30d: (i * 13) % 17,
    lat: 14.55,
    lng: 121.02,
    coverage: { distanceApplies: false, coversAll: true, hasCoverageGeog: false, originCovered: true },
  }));
}

describe("v4 PERF-02 — 합친 고객 그룹 wave 병렬 (결과·상한 동일)", () => {
  for (const sort of ["rating", "reviews", "popular"] as const) {
    it(`sort=${sort}: 늦게 끝나는 wave 가 있어도 직렬과 같은 결과, 그룹 안 wave 는 동시에 진행`, async () => {
      const base = createInMemoryShadowWaveFetcher(pool(90), {
        district: null,
        originLat: null,
        originLng: null,
        distanceAxisEnabled: false,
        sort,
      });
      const serial = await fillShadowRankedViaWaves({
        fetchWave: base,
        district: null,
        sort,
        exposureScope: null,
        applyExposure: false,
        targetCount: 24,
      });
      let inflight = 0;
      let maxInflight = 0;
      const delayed: ShadowWaveFetchFn = async (input) => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        // 뒤 Gi 일수록 먼저 끝나게 → 도착 순서가 바뀌어도 버퍼 순서는 (gi, dj) 순서여야 한다
        await new Promise((r) => setTimeout(r, (6 - input.eligibilityRank) * 2));
        inflight -= 1;
        return base(input);
      };
      const parallel = await fillShadowRankedViaWaves({
        fetchWave: delayed,
        district: null,
        sort,
        exposureScope: null,
        applyExposure: false,
        targetCount: 24,
      });
      expect(parallel.rows.map((r) => r.id)).toEqual(serial.rows.map((r) => r.id));
      expect(parallel.telemetry).toEqual(serial.telemetry);
      expect(maxInflight).toBeGreaterThan(1);
    });
  }

  it("home(단일 Gi 그룹): 앞 그룹이 채우면 뒤 wave 를 부르지 않는다 (조기 종료 유지)", async () => {
    const base = createInMemoryShadowWaveFetcher(
      pool(60).map((c) => ({ ...c, discovery_schedule_state: "ORDERABLE" as const, delivery_available: true })),
      { district: null, originLat: null, originLng: null, distanceAxisEnabled: false, sort: "home" }
    );
    const ranks: number[] = [];
    const res = await fillShadowRankedViaWaves({
      fetchWave: (input) => {
        ranks.push(input.eligibilityRank);
        return base(input);
      },
      district: null,
      sort: "home",
      exposureScope: null,
      applyExposure: false,
      targetCount: 10,
    });
    expect(res.rows).toHaveLength(10);
    expect(ranks).toEqual([0]);
  });
});

describe("v4 DB-05 — unknown 업종/주제 스냅샷 미저장", () => {
  it("unknown_primary·unknown_topic payload 는 저장하지 않고, 정상 payload 는 저장", () => {
    expect(shouldPersistStoresBrowseSnapshotPayload({ unknown_primary: true } as StoresBrowseSnapshotPayloadJson)).toBe(false);
    expect(shouldPersistStoresBrowseSnapshotPayload({ unknown_topic: true } as StoresBrowseSnapshotPayloadJson)).toBe(false);
    expect(shouldPersistStoresBrowseSnapshotPayload({ ok: true } as StoresBrowseSnapshotPayloadJson)).toBe(true);
  });
});

describe("v4 PERF-06 — browse 최종 조립은 순위 단계 서비스 영역 재사용", () => {
  it("순위 맵이 최종 행을 덮으면 조회 0회, 아니면 1회 조회", async () => {
    const fake = createFakeStoreSupabase(() => ({ data: [], error: null }));
    const ranking = new Map([
      ["a", { authorityMode: "legacy_radius" as const, selectedLguIds: [] }],
      ["b", { authorityMode: "legacy_radius" as const, selectedLguIds: [] }],
    ]);
    const reused = await reuseOrLoadBrowseServiceAreaMap(fake.sb as unknown as SupabaseClient, ranking, ["b"]);
    expect([...reused.keys()]).toEqual(["b"]);
    expect(fake.calls).toHaveLength(0);
    await reuseOrLoadBrowseServiceAreaMap(fake.sb as unknown as SupabaseClient, ranking, ["b", "c"]);
    expect(fake.calls.filter((c) => c.table === "stores")).toHaveLength(1);
    await reuseOrLoadBrowseServiceAreaMap(fake.sb as unknown as SupabaseClient, null, ["a"]);
    expect(fake.calls.filter((c) => c.table === "stores")).toHaveLength(2);
  });
});

describe("v4 PERF-07 — 홈 피드 상품 조회 상한", () => {
  it("매장당 20, 최대 1000", () => {
    expect(resolveHomeFeedProductFetchCap(1)).toBe(20);
    expect(resolveHomeFeedProductFetchCap(48)).toBe(960);
    expect(resolveHomeFeedProductFetchCap(100)).toBe(1000);
  });
});

describe("v4 PERF-10 — 90일 주문 수 메모리 캐시", () => {
  beforeEach(() => clearStoreRecentOrderCountCache());
  it("같은 매장 재요청은 count 조회 1회, 세대 purge 후 다시 조회, 오류는 저장 안 함", async () => {
    let n = 0;
    let fail = false;
    const fake = createFakeStoreSupabase(() => {
      n += 1;
      return (fail ? { data: null, error: { message: "x" } } : { data: null, error: null, count: 5 }) as never;
    });
    const sb = fake.sb as unknown as SupabaseClient;
    expect(await loadStoreRecentOrderCount90dCached(sb, "s1")).toBe(5);
    expect(await loadStoreRecentOrderCount90dCached(sb, "s1")).toBe(5);
    expect(n).toBe(1);
    purgeAllStorePublicServerMemoryCaches();
    fail = true;
    expect(await loadStoreRecentOrderCount90dCached(sb, "s1")).toBeNull();
    fail = false;
    expect(await loadStoreRecentOrderCount90dCached(sb, "s1")).toBe(5);
    expect(n).toBe(3);
  });
});

describe("v4 PERF-14 — 배너 매장 조회 1회 (자격·좌표·샘플)", () => {
  it("자격 행으로 OOR 판정·샘플 표시 — stores 추가 조회 없음", async () => {
    const fake = createFakeStoreSupabase(() => ({
      data: [
        { id: "s1", lat: 14.6, lng: 121, delivery_radius_km: 10, store_kind: "sample" },
        { id: "s2", lat: 14.6, lng: 121, delivery_radius_km: 10, store_kind: "real" },
      ],
      error: null,
    }));
    const sb = fake.sb as unknown as SupabaseClient;
    const r = await loadEligibleBannerStoreRows(sb, ["s1", "s2", "s1", null]);
    expect([...r.eligibleStoreIds]).toEqual(["s1", "s2"]);
    expect([...r.sampleStoreIds]).toEqual(["s1"]);
    const stores = fake.calls.filter((c) => c.table === "stores");
    expect(stores).toHaveLength(1);
    expect(stores[0]!.select).toContain("store_kind");
    expect(stores[0]!.filters).toEqual(
      expect.arrayContaining([
        ["eq", "approval_status", "approved"],
        ["eq", "is_visible", true],
      ])
    );
    // 게스트 origin → 좌표 판정 없이 그대로 (추가 조회 없음)
    const kept = await excludeViewerOutOfRangeBannerStores(sb, r.eligibleStoreIds, null, r.rows);
    expect([...kept]).toEqual(["s1", "s2"]);
    const marked = await markSampleStoreBannerSlides(sb, [
      { storeId: "s1", isSampleStore: true },
      { storeId: "s2", isSampleStore: false },
    ]);
    expect(marked.map((m) => m.isSampleStore)).toEqual([true, false]);
    expect(fake.calls.filter((c) => c.table === "stores")).toHaveLength(1);
  });
  it("조회 오류 → 빈 자격(fail-closed)", async () => {
    const fake = createFakeStoreSupabase(() => ({ data: null, error: { message: "x" } }));
    const r = await loadEligibleBannerStoreRows(fake.sb as unknown as SupabaseClient, ["s1"]);
    expect(r.eligibleStoreIds.size).toBe(0);
  });
});

describe("v4 PERF-15 — taxonomy 서버 메모리 캐시", () => {
  beforeEach(() => clearStoreTaxonomyPublicServerCache());
  it("동시 미스는 1회 조회, 이후 캐시 적중, 세대 purge 로 비워짐, null 은 저장 안 함", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 2));
      return { ok: true, categories: [{ id: "c" }] };
    };
    const [a, b] = await Promise.all([loadStoreTaxonomyPublicWithCache(loader), loadStoreTaxonomyPublicWithCache(loader)]);
    expect(a).toEqual(b);
    expect(loads).toBe(1);
    await loadStoreTaxonomyPublicWithCache(loader);
    expect(loads).toBe(1);
    purgeAllStorePublicServerMemoryCaches();
    expect(peekStoreTaxonomyPublicServerCache()).toBeNull();
    await loadStoreTaxonomyPublicWithCache(async () => null);
    expect(peekStoreTaxonomyPublicServerCache()).toBeNull();
  });
});

describe("v4 PERF-16 — 고객 GET 정책 조회는 쓰기 RPC 미호출", () => {
  it("loadResolvedCompositionPolicyRowsReadOnly 는 overrides SELECT 만", async () => {
    const rpc = vi.fn();
    const fake = createFakeStoreSupabase(() => ({ data: [], error: null }), (fn) => {
      rpc(fn);
      return { data: 0, error: null };
    });
    const { rows } = await loadResolvedCompositionPolicyRowsReadOnly(fake.sb as unknown as SupabaseClient, "home");
    expect(Array.isArray(rows)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(fake.calls.map((c) => c.table)).toEqual(["store_composition_policy_overrides"]);
  });
});

describe("v4 PERF-22 — 실제 DB 왕복 수 계측", () => {
  it("from·rpc 호출 수를 세고 원본 동작은 그대로", async () => {
    const fake = createFakeStoreSupabase(() => ({ data: [{ id: 1 }], error: null }), () => ({ data: 9, error: null }));
    const trips = countSupabaseRoundTrips(fake.sb as unknown as SupabaseClient);
    const a = await trips.client.from("stores").select("id");
    const b = await trips.client.rpc("fn");
    await trips.client.from("store_products").select("id").eq("x", 1);
    expect(a.data).toEqual([{ id: 1 }]);
    expect(b.data).toBe(9);
    expect(trips.count()).toBe(3);
  });
});

describe("v4 PERF-22 — 회귀 가드는 실측 왕복 수를 예산과 비교", () => {
  it("예산 이하는 경보 없음, 초과는 excessive_round_trips", async () => {
    const { evaluateStoresBrowseRegressionGuards, STORES_BROWSE_ROUND_TRIP_BUDGET } = await import(
      "@/lib/stores/stores-browse-snapshot-regression-guard"
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const row = {
      route: "/api/stores/browse", total_ms: 1, db_ms: 1, round_trips: STORES_BROWSE_ROUND_TRIP_BUDGET,
      transport_ms: 1, payload_build_ms: 0, stores_fetch_ms: 0, category_join_ms: 0, review_merge_ms: 0,
      rating_merge_ms: 0, delivery_meta_merge_ms: 0, recommendation_merge_ms: 0, search_filter_compute_ms: 0,
      ordering_compute_ms: 0, availability_check_ms: 0, cache_hit: 0 as const, wave_count: 1, query_wave_2_ms: 0,
      sequential_await_detected: 0 as const, aggregate_compute_detected: 0 as const, repeated_join_detected: 0 as const,
      fallback_used: 0 as const, rpc_removed: 1 as const, worst_stage: "x", worst_stage_ms: 0,
    };
    expect(evaluateStoresBrowseRegressionGuards(row).excessive_round_trips).toBe(0);
    expect(evaluateStoresBrowseRegressionGuards({ ...row, round_trips: STORES_BROWSE_ROUND_TRIP_BUDGET + 1 }).excessive_round_trips).toBe(1);
    warn.mockRestore();
  });
});
