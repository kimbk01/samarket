import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHADOW_PAGINATION_ARCHITECTURE,
  STORE_DISCOVERY_SHADOW_BROWSE_MAX_CANDIDATES,
  compareShadowWaveRows,
  createInMemoryShadowWaveFetcher,
  rankStoreDiscoveryBrowseShadow,
  rankStoreDiscoveryHomeShadow,
  type StoreDiscoveryShadowCandidate,
} from "@/lib/stores/discovery/store-discovery-shadow-ranked";
import { buildStoreDiscoveryHomeExposureScope } from "@/lib/stores/store-discovery-exposure";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260823180000_stores_discovery_shadow_wave_cut4.sql"
);

const RANKED = join(process.cwd(), "lib/stores/discovery/store-discovery-shadow-ranked.ts");
const ADAPTER = join(process.cwd(), "lib/stores/discovery/store-discovery-shadow-adapter.ts");

describe("CUT 4 shadow wave migration contract", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("defines bounded Gi×Dj wave RPC with service_role only", () => {
    expect(sql).toContain("get_store_discovery_shadow_wave");
    expect(sql).toContain("p_eligibility_rank");
    expect(sql).toContain("p_district_tier");
    expect(sql).toContain("LIMIT v_limit");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_store_discovery_shadow_wave[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_store_discovery_shadow_wave[\s\S]*TO service_role/);
  });

  it("adds dense sort indexes and does not scan store_orders", () => {
    expect(sql).toContain("idx_stores_discovery_wave_popular");
    expect(sql).toContain("idx_stores_discovery_wave_rating");
    expect(sql).toContain("idx_stores_discovery_wave_reviews");
    expect(sql).not.toMatch(/FROM\s+public\.store_orders/i);
    expect(sql).not.toMatch(/business_hours_json/i);
  });

  it("CUT6 wave parity migration orders out_of_range before distance", () => {
    const cut6 = readFileSync(
      join(process.cwd(), "supabase/migrations/20260823186000_stores_discovery_shadow_wave_parity_cut6.sql"),
      "utf8"
    );
    expect(cut6).toContain("out_of_range IS TRUE THEN 1 ELSE 0");
    expect(cut6).toContain("distance_applies IS TRUE");
    expect(cut6).not.toMatch(/WHEN v_gi NOT IN \(0, 2\) THEN false/);
  });

  it("pushes Gi schedule predicates and skips coverage for non-geo groups", () => {
    expect(sql).toContain("v_gi NOT IN (0, 2)");
    expect(sql).toContain("discovery_schedule_state = 'ORDERABLE'");
    expect(sql).toContain("store_discovery_shadow_in_range");
  });
});

describe("CUT 4 bounded path guards", () => {
  it("removes arbitrary candidate cap", () => {
    expect(STORE_DISCOVERY_SHADOW_BROWSE_MAX_CANDIDATES).toBe(0);
    expect(SHADOW_PAGINATION_ARCHITECTURE).toBe("bounded_offset_via_gi_dj_waves");
  });

  it("shadow ranked module has no full-pool .sort( on candidates)", () => {
    const src = readFileSync(RANKED, "utf8");
    expect(src).not.toMatch(/candidates\.sort\s*\(/);
    expect(src).not.toMatch(/scoped\.sort\s*\(/);
    expect(src).not.toMatch(/built\.rows\)\.sort/);
    expect(src).toMatch(/Sort ONLY this Gi/);
  });

  it("adapter uses wave RPC not bulk CUT3 pool", () => {
    const src = readFileSync(ADAPTER, "utf8");
    expect(src).toContain("get_store_discovery_shadow_wave");
    expect(src).not.toMatch(/get_store_discovery_home_shadow/);
    expect(src).not.toMatch(/get_store_discovery_browse_shadow/);
    expect(src).not.toMatch(/p_max_candidates/);
  });

  it("wave fetcher sorts only Gi subset size not full pool", () => {
    const pool: StoreDiscoveryShadowCandidate[] = [];
    for (let i = 0; i < 200; i += 1) {
      pool.push({
        id: `id-${i}`,
        slug: `s-${String(i).padStart(3, "0")}`,
        district: "Makati",
        rating_avg: i % 5,
        review_count: i,
        delivery_available: true,
        discovery_schedule_state: "ORDERABLE",
        completed_orders_30d: i,
        lat: 14.6,
        lng: 120.98,
        coverage: {
          distanceApplies: false,
          coversAll: true,
          hasCoverageGeog: false,
          originCovered: true,
        },
      });
    }
    const fetchWave = createInMemoryShadowWaveFetcher(pool, {
      district: null,
      originLat: 14.6,
      originLng: 120.98,
      distanceAxisEnabled: false,
      sort: "popular",
    });
    const wave = fetchWave({ eligibilityRank: 0, districtTier: 0, limit: 10 }) as {
      id: string;
    }[];
    expect(wave).toHaveLength(10);
    expect(wave[0]?.id).toBe("id-199");
  });
});

describe("CUT 4 exposure page-boundary parity", () => {
  it("page2 start continues page1 end without membership overlap", () => {
    const candidates: StoreDiscoveryShadowCandidate[] = [];
    for (let i = 0; i < 150; i += 1) {
      candidates.push({
        id: `p${String(i).padStart(3, "0")}`,
        slug: `p${String(i).padStart(3, "0")}`,
        district: i % 2 === 0 ? "Makati" : "Pasig",
        rating_avg: 4,
        review_count: i,
        delivery_available: true,
        discovery_schedule_state: "ORDERABLE",
        completed_orders_30d: 150 - i,
        lat: 14.6,
        lng: 120.98 + i * 0.0001,
        coverage: {
          distanceApplies: true,
          coversAll: true,
          hasCoverageGeog: false,
          originCovered: true,
        },
      });
    }
    const scope = buildStoreDiscoveryHomeExposureScope({
      region: null,
      district: "Makati",
      searchQ: null,
      originKey: "o",
      hasGeo: true,
      geoKey: "g",
    });
    const page1 = rankStoreDiscoveryBrowseShadow({
      candidates,
      sort: "default",
      district: "Makati",
      originLat: 14.6,
      originLng: 120.98,
      distanceAxisEnabled: true,
      page: 1,
      limit: 60,
      exposureScope: scope,
      nowMs: 1_700_000_000_000,
    });
    const page2 = rankStoreDiscoveryBrowseShadow({
      candidates,
      sort: "default",
      district: "Makati",
      originLat: 14.6,
      originLng: 120.98,
      distanceAxisEnabled: true,
      page: 2,
      limit: 60,
      exposureScope: scope,
      nowMs: 1_700_000_000_000,
    });
    expect(page1.rows).toHaveLength(60);
    expect(page2.rows.length).toBeGreaterThan(0);
    expect(page1.telemetry.wavesExecuted).toBeGreaterThan(0);
    expect(page1.telemetry.rowsReturned).toBeLessThan(candidates.length);
    const overlap = page1.rows.filter((r) => page2.rows.some((x) => x.id === r.id));
    expect(overlap).toHaveLength(0);
  });

  it("HOME wave telemetry stays bounded vs pool size", () => {
    const candidates: StoreDiscoveryShadowCandidate[] = Array.from({ length: 400 }, (_, i) => ({
      id: `h${i}`,
      slug: `h${String(i).padStart(3, "0")}`,
      district: "Makati",
      rating_avg: 4,
      review_count: 1,
      delivery_available: true,
      discovery_schedule_state: "ORDERABLE" as const,
      completed_orders_30d: i,
      lat: 14.6,
      lng: 120.98,
      coverage: {
        distanceApplies: false,
        coversAll: false,
        hasCoverageGeog: false,
        originCovered: false,
      },
    }));
    const result = rankStoreDiscoveryHomeShadow({
      candidates,
      district: null,
      originLat: null,
      originLng: null,
      distanceAxisEnabled: false,
      exposureScope: "home\0",
      nowMs: 1,
      limit: 48,
    });
    expect(result.rows).toHaveLength(48);
    expect(result.telemetry.rowsReturned).toBeLessThanOrEqual(48 + 3);
    expect(result.telemetry.rowsReturned).toBeLessThan(candidates.length);
  });
});

describe("CUT 4 within-wave comparator", () => {
  it("popular orders by completed_orders_30d then rating", () => {
    const a = {
      id: "a",
      slug: "a",
      district: null,
      rating_avg: 5,
      review_count: 1,
      eligibilityRank: 0,
      eligibilityState: "orderable_deliverable",
      districtTier: 0,
      distanceKm: 1,
      outOfRange: false,
      completedOrders30d: 10,
    };
    const b = {
      ...a,
      id: "b",
      slug: "b",
      completedOrders30d: 20,
      rating_avg: 1,
    };
    expect(compareShadowWaveRows("popular", false, a, b)).toBeGreaterThan(0);
  });
});
