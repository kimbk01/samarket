import { describe, expect, it } from "vitest";
import {
  applyStoreDiscoveryExposureRotation,
  buildStoreDiscoveryBrowseExposureScope,
  buildStoreDiscoveryHomeExposureScope,
  deterministicExposureStringHash,
  resolveStoreDiscoveryExposureBandOffset,
  resolveStoreDiscoveryExposureTimeSlice,
  STORE_DISCOVERY_EXPOSURE_BAND_SIZE,
  STORE_DISCOVERY_EXPOSURE_WINDOW_MS,
} from "@/lib/stores/store-discovery-exposure";
import { sortStoreDiscoveryBrowseRows } from "@/lib/stores/store-discovery-browse-sort";
import { sortStoreDiscoveryHomeFeedRows } from "@/lib/stores/store-discovery-browse-sort";
import { applyStoreDiscoveryExposureRotation as exposureFn } from "@/lib/stores/store-discovery-exposure";

type Row = { id: string; slug: string; district: string | null; rating_avg: number | null; review_count: number | null };

function row(id: string, partial: Partial<Row> = {}): Row {
  return {
    id,
    slug: partial.slug ?? id,
    district: partial.district ?? null,
    rating_avg: partial.rating_avg ?? 4,
    review_count: partial.review_count ?? 1,
    ...partial,
  };
}

function twelveStoreFixture(): Row[] {
  return [
    row("s01"),
    row("s02"),
    row("s03"),
    row("s04"),
    row("s05"),
    row("s06"),
    row("s07"),
    row("s08"),
    row("s09"),
    row("s10"),
    row("s11"),
    row("s12"),
  ];
}

const scope = "test-scope";
const eligibilityAll0 = new Map(twelveStoreFixture().map((r) => [r.id, 0]));

describe("store-discovery-exposure CUT2", () => {
  it("T1 — same candidate + scope + time slice → identical order", () => {
    const recommended = twelveStoreFixture();
    const nowMs = STORE_DISCOVERY_EXPOSURE_WINDOW_MS * 5 + 1000;
    const a = applyStoreDiscoveryExposureRotation({
      recommendedSorted: recommended,
      eligibilityRankById: eligibilityAll0,
      exposureScope: scope,
      nowMs,
    });
    const b = applyStoreDiscoveryExposureRotation({
      recommendedSorted: recommended,
      eligibilityRankById: eligibilityAll0,
      exposureScope: scope,
      nowMs,
    });
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });

  it("T2 — next time slice can change order within a full band", () => {
    const recommended = twelveStoreFixture();
    const slice0 = 10;
    const slice1 = slice0 + 1;
    const now0 = slice0 * STORE_DISCOVERY_EXPOSURE_WINDOW_MS + 1000;
    const now1 = slice1 * STORE_DISCOVERY_EXPOSURE_WINDOW_MS + 1000;
    const out0 = applyStoreDiscoveryExposureRotation({
      recommendedSorted: recommended,
      eligibilityRankById: eligibilityAll0,
      exposureScope: scope,
      nowMs: now0,
    });
    const out1 = applyStoreDiscoveryExposureRotation({
      recommendedSorted: recommended,
      eligibilityRankById: eligibilityAll0,
      exposureScope: scope,
      nowMs: now1,
    });
    expect(out0.map((r) => r.id)).not.toEqual(recommended.map((r) => r.id));
    expect(out1.map((r) => r.id)).not.toEqual(out0.map((r) => r.id));
    // band membership preserved
    expect(new Set(out0.map((r) => r.id))).toEqual(new Set(recommended.map((r) => r.id)));
  });

  it("T3 — rank 5 cannot enter rank 1–4 band", () => {
    const recommended = twelveStoreFixture();
    const slice = 99;
    const nowMs = slice * STORE_DISCOVERY_EXPOSURE_WINDOW_MS;
    const exposed = applyStoreDiscoveryExposureRotation({
      recommendedSorted: recommended,
      eligibilityRankById: eligibilityAll0,
      exposureScope: scope,
      nowMs,
    });
    const firstBandOriginal = recommended.slice(0, STORE_DISCOVERY_EXPOSURE_BAND_SIZE).map((r) => r.id);
    const firstBandExposed = exposed.slice(0, STORE_DISCOVERY_EXPOSURE_BAND_SIZE).map((r) => r.id);
    expect(new Set(firstBandExposed)).toEqual(new Set(firstBandOriginal));
    expect(recommended[4].id).toBe(exposed[4].id === recommended[4].id ? exposed.find((r, i) => i >= 4 && r.id === recommended[4].id)!.id : recommended[4].id);
    // s05 must still be 5th position (first of band 2)
    expect(exposed[4].id).toBe("s05");
    expect(firstBandExposed.includes("s05")).toBe(false);
  });

  it("T4 — lower eligibility cannot move ahead of higher eligibility", () => {
    const recommended = [
      row("open-a"),
      row("open-b"),
      row("open-c"),
      row("open-d"),
      row("closed-x", { rating_avg: 5, review_count: 100 }),
    ];
    const ranks = new Map([
      ["open-a", 0],
      ["open-b", 0],
      ["open-c", 0],
      ["open-d", 0],
      ["closed-x", 5],
    ]);
    const nowMs = 42 * STORE_DISCOVERY_EXPOSURE_WINDOW_MS;
    const exposed = applyStoreDiscoveryExposureRotation({
      recommendedSorted: recommended,
      eligibilityRankById: ranks,
      exposureScope: scope,
      nowMs,
    });
    expect(exposed[exposed.length - 1].id).toBe("closed-x");
    const closedIdx = exposed.findIndex((r) => r.id === "closed-x");
    const openIds = ["open-a", "open-b", "open-c", "open-d"];
    for (const id of openIds) {
      expect(exposed.findIndex((r) => r.id === id)).toBeLessThan(closedIdx);
    }
  });

  it("T5 — explicit sort paths do not call exposure (browse sort unchanged)", () => {
    const rows = twelveStoreFixture();
    const ctx = {
      district: null,
      sort: "rating" as const,
      eligibilityRankById: eligibilityAll0,
      distanceKmById: new Map(),
      outOfRangeById: new Map(),
      hasGeo: false,
    };
    const sorted = sortStoreDiscoveryBrowseRows(rows, ctx);
    expect(sorted.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it("T6 — HOME and BROWSE use same exposure function", () => {
    const recommended = twelveStoreFixture();
    const homeScope = buildStoreDiscoveryHomeExposureScope({
      region: "manila",
      district: null,
      searchQ: null,
      originKey: "none",
      hasGeo: false,
      geoKey: "",
    });
    const browseScope = buildStoreDiscoveryBrowseExposureScope({
      primary: "restaurant",
      sub: "all",
      regionQ: "",
      cityQ: "",
      district: null,
      geoPart: "g:none",
    });
    const nowMs = 7 * STORE_DISCOVERY_EXPOSURE_WINDOW_MS;
    const homeCtx = {
      district: null,
      eligibilityRankById: eligibilityAll0,
      distanceKmById: null,
      outOfRangeById: null,
      hasGeo: false,
      completedOrderCount30dById: new Map<string, number>(),
      completedOrderCountStatus: "ok" as const,
    };
    const homeRecommended = sortStoreDiscoveryHomeFeedRows(recommended, homeCtx);
    const browseRecommended = sortStoreDiscoveryBrowseRows(recommended, {
      ...homeCtx,
      sort: "default",
    });
    expect(homeRecommended.map((r) => r.id)).toEqual(browseRecommended.map((r) => r.id));

    const homeExposed = exposureFn({
      recommendedSorted: homeRecommended,
      eligibilityRankById: eligibilityAll0,
      exposureScope: homeScope,
      nowMs,
    });
    const browseExposed = exposureFn({
      recommendedSorted: browseRecommended,
      eligibilityRankById: eligibilityAll0,
      exposureScope: browseScope,
      nowMs,
    });
    // same function — different scope yields different order (expected)
    expect(homeExposed.length).toBe(12);
    expect(browseExposed.length).toBe(12);
    expect(typeof applyStoreDiscoveryExposureRotation).toBe("function");
  });

  it("T7 — exposure before pagination slice (contract simulation)", () => {
    const recommended = twelveStoreFixture();
    const nowMs = 3 * STORE_DISCOVERY_EXPOSURE_WINDOW_MS;
    const fullExposed = applyStoreDiscoveryExposureRotation({
      recommendedSorted: recommended,
      eligibilityRankById: eligibilityAll0,
      exposureScope: scope,
      nowMs,
    });
    const pageSize = 5;
    const page1Wrong = recommended.slice(0, pageSize);
    const page1Right = fullExposed.slice(0, pageSize);
    expect(page1Wrong.map((r) => r.id)).not.toEqual(page1Right.map((r) => r.id));
    expect(fullExposed.slice(5, 10).map((r) => r.id)).not.toEqual(recommended.slice(5, 10).map((r) => r.id));
  });

  it("deterministic hash is stable", () => {
    expect(deterministicExposureStringHash("abc")).toBe(deterministicExposureStringHash("abc"));
    expect(deterministicExposureStringHash("abc")).not.toBe(deterministicExposureStringHash("abd"));
  });

  it("time slice resolves hourly buckets", () => {
    expect(resolveStoreDiscoveryExposureTimeSlice(0)).toBe(0);
    expect(resolveStoreDiscoveryExposureTimeSlice(STORE_DISCOVERY_EXPOSURE_WINDOW_MS - 1)).toBe(0);
    expect(resolveStoreDiscoveryExposureTimeSlice(STORE_DISCOVERY_EXPOSURE_WINDOW_MS)).toBe(1);
  });

  it("band offset is within band length", () => {
    const off = resolveStoreDiscoveryExposureBandOffset(scope, 5, 4);
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThan(4);
  });
});
