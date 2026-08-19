import { describe, expect, it } from "vitest";
import {
  getTradeLguCentroid,
  getTradeLguCentroidCount,
  matchTradeLguIdsInRadius,
} from "@/lib/trade/location/national/lgu-centroids";
import {
  buildTradeFeedLocationOrFilter,
  resolveTradeFeedLocationConstraint,
  tradeFeedLocationCacheSegment,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { tradeFeedLocationToQueryExtras } from "@/lib/trade/location/national/trade-feed-location-query-extras";
import {
  applyTradeLocationScopeToSearchParams,
  parseTradeLocationScopeFromSearchParams,
  tradeLocationScopeCacheSegment,
} from "@/lib/trade/location/trade-location-scope";
import {
  TRADE_BROWSE_RECOMMENDED_RADIUS_KM,
  sanitizeTradeBrowseRadiusKm,
} from "@/lib/trade/location/trade-browse-radius";

const QC = "1381300000";
const PASIG = "1381200000";

describe("trade browse radius Phase 3", () => {
  it("loads static LGU centroids without runtime geocode", () => {
    expect(getTradeLguCentroidCount()).toBeGreaterThan(1300);
    expect(getTradeLguCentroid(QC)).toEqual({
      lat: expect.any(Number),
      lng: expect.any(Number),
    });
  });

  it("matches city-grain LGUs for small/medium/large radius around Quezon City", () => {
    const center = getTradeLguCentroid(QC)!;
    const small = matchTradeLguIdsInRadius({
      centerLat: center.lat,
      centerLng: center.lng,
      radiusKm: 5,
      centerCanonicalId: QC,
    });
    const medium = matchTradeLguIdsInRadius({
      centerLat: center.lat,
      centerLng: center.lng,
      radiusKm: 32,
      centerCanonicalId: QC,
    });
    const large = matchTradeLguIdsInRadius({
      centerLat: center.lat,
      centerLng: center.lng,
      radiusKm: 160,
      centerCanonicalId: QC,
    });
    expect(small).toContain(QC);
    expect(medium.length).toBeGreaterThan(small.length);
    expect(large.length).toBeGreaterThan(medium.length);
    expect(medium).toContain(PASIG);
  });

  it("URL parse/serialize radius; ALL strips radius", () => {
    const city = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=pasig&radius=32")
    );
    expect(city).toEqual({
      mode: "city",
      lguId: "pasig",
      canonicalId: PASIG,
      radiusKm: 32,
    });
    expect(tradeLocationScopeCacheSegment(city)).toBe(`loc:lgu:${PASIG}:r:32`);

    const missing = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=pasig")
    );
    expect(missing.mode).toBe("city");
    if (missing.mode === "city") {
      expect(missing.radiusKm).toBeNull();
    }

    const allParams = applyTradeLocationScopeToSearchParams(
      new URLSearchParams("location=city&lgu=pasig&radius=96&foo=1"),
      { mode: "all" }
    );
    expect(allParams.get("location")).toBe("all");
    expect(allParams.get("lgu")).toBeNull();
    expect(allParams.get("radius")).toBeNull();
    expect(allParams.get("foo")).toBe("1");
  });

  it("feed constraint without radius keeps single city", () => {
    const c = resolveTradeFeedLocationConstraint("pasig", null);
    expect(c.kind).toBe("lgu");
    if (c.kind !== "lgu") return;
    expect(c.radiusKm).toBeNull();
    expect(c.matchingCanonicalIds).toEqual([PASIG]);
    expect(tradeFeedLocationCacheSegment(c)).toBe(`loc:lgu:${PASIG}:r:none`);
  });

  it("feed constraint expands matching ids and cache includes radius", () => {
    const c = resolveTradeFeedLocationConstraint("pasig", 32);
    expect(c.kind).toBe("lgu");
    if (c.kind !== "lgu") return;
    expect(c.radiusKm).toBe(32);
    expect(c.matchingCanonicalIds.length).toBeGreaterThan(1);
    expect(c.matchingCanonicalIds).toContain(PASIG);
    expect(tradeFeedLocationCacheSegment(c)).toBe(`loc:lgu:${PASIG}:r:32`);
    const extras = tradeFeedLocationToQueryExtras(c);
    expect(extras?.type === "in" || extras?.type === "or").toBe(true);
  });

  it("tiny radius keeps Pasig single-city national eq + legacy or", () => {
    const c = resolveTradeFeedLocationConstraint("pasig", 1);
    expect(c.kind).toBe("lgu");
    if (c.kind !== "lgu") return;
    expect(c.matchingCanonicalIds).toEqual([PASIG]);
    expect(buildTradeFeedLocationOrFilter(c)).toBe(
      `trade_lgu_id.eq.${PASIG},and(trade_lgu_id.is.null,region.eq.manila,city.in.(m20,m21,m22))`
    );
    expect(tradeFeedLocationToQueryExtras(c)).toEqual({
      type: "or",
      orBody: buildTradeFeedLocationOrFilter(c),
    });
  });

  it("sanitize clamps custom radius", () => {
    expect(sanitizeTradeBrowseRadiusKm(0)).toBe(1);
    expect(sanitizeTradeBrowseRadiusKm(9999)).toBe(500);
    expect(sanitizeTradeBrowseRadiusKm("64")).toBe(64);
  });
});
