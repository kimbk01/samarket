import { describe, expect, it } from "vitest";
import {
  TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL,
  resolveTradeLguUrlTokenToCanonical,
} from "@/lib/trade/location/national/legacy-product-alias-canonical";
import { searchTradeNationalLgu } from "@/lib/trade/location/national/search-trade-national-lgu";
import { resolveTradeNationalLgu } from "@/lib/trade/location/national/resolve-trade-national-lgu";
import { loadTradeNationalLguDataset } from "@/lib/trade/location/national/load-national-lgu-dataset";
import {
  resolveTradeFeedLocationConstraint,
  tradeFeedLocationCacheSegment,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import {
  buildTradeCityScopeFromCanonical,
  parseTradeLocationScopeFromSearchParams,
  tradeLocationScopeCacheSegment,
} from "@/lib/trade/location/trade-location-scope";
import { resolveTradeLguNearbyCities } from "@/lib/trade/location/trade-lgu-adjacency";

const SAMPLES = [
  { q: "Pasig", id: "1381200000" },
  { q: "Davao", id: "1130700000" },
  { q: "Baguio", id: "1430300000" },
  { q: "Iloilo", id: "0631000000" },
  { q: "Cainta", id: "0405805000" },
] as const;

describe("Trade location UI national selector chain", () => {
  it("DEFAULT ALL has no location constraint", () => {
    const scope = parseTradeLocationScopeFromSearchParams(new URLSearchParams(""));
    expect(scope).toEqual({ mode: "all" });
    expect(resolveTradeFeedLocationConstraint(null).kind).toBe("all");
  });

  it("search samples resolve to selectable/queryable canonical ids", () => {
    for (const s of SAMPLES) {
      const hits = searchTradeNationalLgu(s.q, { limit: 20 });
      const hit = hits.find((h) => h.canonicalId === s.id);
      expect(hit, s.q).toBeTruthy();
      const scope = buildTradeCityScopeFromCanonical(s.id);
      expect(scope?.canonicalId).toBe(s.id);
      const constraint = resolveTradeFeedLocationConstraint(scope!.lguId);
      expect(constraint.kind).toBe("lgu");
      if (constraint.kind === "lgu") {
        expect(constraint.canonicalId).toBe(s.id);
      }
      expect(tradeFeedLocationCacheSegment(constraint)).toBe(`loc:lgu:${s.id}`);
      expect(tradeLocationScopeCacheSegment(scope!)).toBe(`loc:lgu:${s.id}`);
    }
  });

  it("my-address national resolve: Pasig / Davao / Cainta", () => {
    const cases = [
      { city: "Pasig City", id: "1381200000" },
      { city: "Davao City", id: "1130700000" },
      { city: "Cainta", province: "Rizal", id: "0405805000" },
    ];
    for (const c of cases) {
      const r = resolveTradeNationalLgu({
        cityMunicipality: c.city,
        province: c.province ?? null,
      });
      expect(r.status).toBe("resolved");
      if (r.status === "resolved") expect(r.canonicalId).toBe(c.id);
    }
  });

  it("MASTER Pasig + DISCOVERY Davao: scopes independent; cache is Davao", () => {
    const master = resolveTradeNationalLgu({ cityMunicipality: "Pasig City" });
    expect(master.status).toBe("resolved");
    const discovery = buildTradeCityScopeFromCanonical("1130700000");
    expect(discovery?.canonicalId).toBe("1130700000");
    if (master.status !== "resolved" || !discovery) return;
    expect(master.canonicalId).not.toBe(discovery.canonicalId);
    const params = new URLSearchParams();
    params.set("location", "city");
    params.set("lgu", discovery.lguId);
    const parsed = parseTradeLocationScopeFromSearchParams(params);
    expect(parsed.mode).toBe("city");
    if (parsed.mode === "city") {
      expect(parsed.canonicalId).toBe("1130700000");
      expect(tradeLocationScopeCacheSegment(parsed)).toBe("loc:lgu:1130700000");
    }
  });

  it("pasig alias and PSGC share one cache namespace", () => {
    const a = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=pasig")
    );
    const b = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=1381200000")
    );
    expect(tradeLocationScopeCacheSegment(a)).toBe("loc:lgu:1381200000");
    expect(tradeLocationScopeCacheSegment(b)).toBe("loc:lgu:1381200000");
  });

  it("invalid LGU is not silent ALL", () => {
    const scope = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=garbage")
    );
    expect(scope).toEqual({ mode: "invalid", raw: "garbage" });
    expect(resolveTradeFeedLocationConstraint("garbage").kind).toBe("invalid");
  });

  it("nearby only for curated legacy 29; national Davao has none", () => {
    expect(resolveTradeLguNearbyCities("pasig").length).toBeGreaterThan(0);
    expect(resolveTradeLguNearbyCities("1130700000")).toEqual([]);
    expect(resolveTradeLguNearbyCities(null)).toEqual([]);
  });

  it("legacy 29/29 aliases map to active national LGU", () => {
    const ds = loadTradeNationalLguDataset();
    const entries = Object.entries(TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL);
    expect(entries.length).toBe(29);
    for (const [alias, cid] of entries) {
      expect(resolveTradeLguUrlTokenToCanonical(alias)).toBe(cid);
      expect(ds.byId.get(cid)?.isActive).toBe(true);
      const scope = buildTradeCityScopeFromCanonical(cid);
      expect(scope?.canonicalId).toBe(cid);
      expect(resolveTradeFeedLocationConstraint(alias).kind).toBe("lgu");
    }
  });

  it("national coverage contract 1642 = 147 city + 1495 municipality", () => {
    const ds = loadTradeNationalLguDataset();
    const active = ds.lgus.filter((l) => l.isActive);
    expect(active.length).toBe(1642);
    expect(active.filter((l) => l.lguType === "city").length).toBe(147);
    expect(active.filter((l) => l.lguType === "municipality").length).toBe(1495);
  });
});
