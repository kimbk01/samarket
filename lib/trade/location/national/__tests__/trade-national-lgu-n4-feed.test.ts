import { describe, expect, it } from "vitest";
import {
  TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL,
  resolveTradeLguUrlTokenToCanonical,
} from "@/lib/trade/location/national/legacy-product-alias-canonical";
import { loadTradeNationalLguDataset } from "@/lib/trade/location/national/load-national-lgu-dataset";
import {
  buildTradeFeedLocationOrFilter,
  listingMatchesTradeFeedLocation,
  resolveTradeFeedLocationConstraint,
  tradeFeedLocationCacheSegment,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { tradeFeedLocationToQueryExtras } from "@/lib/trade/location/national/trade-feed-location-query-extras";
import {
  parseTradeLocationScopeFromSearchParams,
  tradeLocationScopeCacheSegment,
} from "@/lib/trade/location/trade-location-scope";
import {
  listTradeLguCities,
  resolveTradeLguCityQueryConstraint,
} from "@/lib/trade/location/trade-lgu-city-rollup";

const PASIG = "1381200000";
const DAVAO = "1130700000";
const CAINTA = "0405805000";

describe("N4 trade feed national location filter", () => {
  it("resolves legacy alias and PSGC to the same canonical", () => {
    expect(resolveTradeLguUrlTokenToCanonical("pasig")).toBe(PASIG);
    expect(resolveTradeLguUrlTokenToCanonical(PASIG)).toBe(PASIG);
    expect(resolveTradeLguUrlTokenToCanonical("garbage")).toBeNull();
  });

  it("keeps browser alias table 29/29 vs national dataset legacy_product", () => {
    const ds = loadTradeNationalLguDataset();
    const fromData = new Map(
      ds.aliases
        .filter((a) => a.kind === "legacy_product")
        .map((a) => [a.aliasRaw, a.canonicalId] as const)
    );
    const browser = Object.entries(TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL);
    expect(browser.length).toBe(29);
    expect(fromData.size).toBe(29);
    for (const [alias, cid] of browser) {
      expect(fromData.get(alias)).toBe(cid);
    }
  });

  it("Pasig constraint includes null-gated legacy members matching rollup", () => {
    const c = resolveTradeFeedLocationConstraint("pasig", 1);
    expect(c.kind).toBe("lgu");
    if (c.kind !== "lgu") return;
    expect(c.canonicalId).toBe(PASIG);
    expect(c.matchingCanonicalIds).toEqual([PASIG]);
    expect(c.legacyMembers).toEqual([{ regionId: "manila", cityIds: ["m20", "m21", "m22"] }]);
    const rollup = resolveTradeLguCityQueryConstraint("pasig");
    expect(rollup).toEqual({ regionId: "manila", cityIds: ["m20", "m21", "m22"] });
  });

  it("all 29 rollup LGUs agree with national local-area map members", () => {
    for (const city of listTradeLguCities()) {
      const c = resolveTradeFeedLocationConstraint(city.id, 1);
      expect(c.kind).toBe("lgu");
      if (c.kind !== "lgu") continue;
      const rollup = resolveTradeLguCityQueryConstraint(city.id);
      expect(rollup).not.toBeNull();
      if (!rollup) continue;
      const member = c.legacyMembers.find((m) => m.regionId === rollup.regionId);
      expect(member?.cityIds).toEqual([...rollup.cityIds].sort());
    }
  });

  it("Davao has national-only filter (empty legacy members)", () => {
    const c = resolveTradeFeedLocationConstraint(DAVAO, 1);
    expect(c.kind).toBe("lgu");
    if (c.kind !== "lgu") return;
    expect(c.matchingCanonicalIds).toEqual([DAVAO]);
    expect(c.legacyMembers).toEqual([]);
    expect(buildTradeFeedLocationOrFilter(c)).toBe(`trade_lgu_id.eq.${DAVAO}`);
    expect(tradeFeedLocationToQueryExtras(c)).toEqual({ type: "eq", canonicalId: DAVAO });
  });

  it("Cainta municipality uses same contract as city", () => {
    const c = resolveTradeFeedLocationConstraint(CAINTA, 1);
    expect(c.kind).toBe("lgu");
    if (c.kind !== "lgu") return;
    expect(c.canonicalId).toBe(CAINTA);
    const ds = loadTradeNationalLguDataset();
    expect(ds.byId.get(CAINTA)?.lguType).toBe("municipality");
  });

  it("PostgREST OR body nests and() for multi-city legacy Pasig", () => {
    const c = resolveTradeFeedLocationConstraint("pasig", 1);
    expect(c.kind).toBe("lgu");
    if (c.kind !== "lgu") return;
    const orBody = buildTradeFeedLocationOrFilter(c);
    expect(orBody).toBe(
      `trade_lgu_id.eq.${PASIG},and(trade_lgu_id.is.null,region.eq.manila,city.in.(m20,m21,m22))`
    );
    expect(tradeFeedLocationToQueryExtras(c)).toEqual({ type: "or", orBody });
  });

  it("ALL mode has no location constraint", () => {
    expect(resolveTradeFeedLocationConstraint(null)).toEqual({ kind: "all" });
    expect(resolveTradeFeedLocationConstraint("")).toEqual({ kind: "all" });
    expect(tradeFeedLocationToQueryExtras({ kind: "all" })).toBeUndefined();
  });

  it("invalid LGU is explicit, not silent ALL", () => {
    const c = resolveTradeFeedLocationConstraint("garbage");
    expect(c).toEqual({ kind: "invalid", raw: "garbage" });
    expect(tradeFeedLocationToQueryExtras(c)).toEqual({ type: "none" });
    const scope = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=garbage")
    );
    expect(scope).toEqual({ mode: "invalid", raw: "garbage" });
  });

  it("LEGACY PASIG null national matches Pasig only", () => {
    const pasig = resolveTradeFeedLocationConstraint("pasig", 1);
    expect(pasig.kind).toBe("lgu");
    if (pasig.kind !== "lgu") return;
    const row = { trade_lgu_id: null, region: "manila", city: "m20" };
    expect(listingMatchesTradeFeedLocation(row, pasig)).toBe(true);
    const davao = resolveTradeFeedLocationConstraint(DAVAO, 1);
    expect(davao.kind).toBe("lgu");
    if (davao.kind !== "lgu") return;
    expect(listingMatchesTradeFeedLocation(row, davao)).toBe(false);
  });

  it("NEW PASIG canonical matches once; legacy alone does not double-count equation", () => {
    const pasig = resolveTradeFeedLocationConstraint(PASIG, 1);
    expect(pasig.kind).toBe("lgu");
    if (pasig.kind !== "lgu") return;
    const row = { trade_lgu_id: PASIG, region: "manila", city: "m20" };
    expect(listingMatchesTradeFeedLocation(row, pasig)).toBe(true);
    // national branch wins — still a single boolean match (no union duplicate)
    expect(
      [row].filter((r) => listingMatchesTradeFeedLocation(r, pasig)).map((r) => r.trade_lgu_id)
        .length
    ).toBe(1);
  });

  it("NEW DAVAO matches Davao only", () => {
    const davao = resolveTradeFeedLocationConstraint(DAVAO, 1);
    const pasig = resolveTradeFeedLocationConstraint("pasig", 1);
    expect(davao.kind).toBe("lgu");
    expect(pasig.kind).toBe("lgu");
    if (davao.kind !== "lgu" || pasig.kind !== "lgu") return;
    const row = { trade_lgu_id: DAVAO, region: null, city: null };
    expect(listingMatchesTradeFeedLocation(row, davao)).toBe(true);
    expect(listingMatchesTradeFeedLocation(row, pasig)).toBe(false);
  });

  it("CONFLICT: Davao national + Pasig legacy local — Pasig NO, Davao YES", () => {
    const conflict = {
      trade_lgu_id: DAVAO,
      region: "manila",
      city: "m20",
    };
    const pasig = resolveTradeFeedLocationConstraint("pasig", 1);
    const davao = resolveTradeFeedLocationConstraint(DAVAO, 1);
    expect(pasig.kind).toBe("lgu");
    expect(davao.kind).toBe("lgu");
    if (pasig.kind !== "lgu" || davao.kind !== "lgu") return;
    expect(listingMatchesTradeFeedLocation(conflict, pasig)).toBe(false);
    expect(listingMatchesTradeFeedLocation(conflict, davao)).toBe(true);
  });

  it("cache segment collapses alias and canonical to one namespace", () => {
    const a = resolveTradeFeedLocationConstraint("pasig", 64);
    const b = resolveTradeFeedLocationConstraint(PASIG, 64);
    expect(tradeFeedLocationCacheSegment(a)).toBe(`loc:lgu:${PASIG}:r:64`);
    expect(tradeFeedLocationCacheSegment(b)).toBe(`loc:lgu:${PASIG}:r:64`);
    const scopeA = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=pasig")
    );
    const scopeB = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams(`location=city&lgu=${PASIG}`)
    );
    expect(tradeLocationScopeCacheSegment(scopeA)).toBe(`loc:lgu:${PASIG}:r:64`);
    expect(tradeLocationScopeCacheSegment(scopeB)).toBe(`loc:lgu:${PASIG}:r:64`);
  });

  it("local-area map covers 143 rows for national bridge", () => {
    const ds = loadTradeNationalLguDataset();
    expect(ds.localAreaMap.length).toBe(143);
  });
});
