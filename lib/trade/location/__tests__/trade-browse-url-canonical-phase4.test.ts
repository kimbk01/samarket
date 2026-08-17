import { describe, expect, it } from "vitest";
import {
  applyTradeLocationScopeToSearchParams,
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  tradeLocationScopeCacheSegment,
} from "@/lib/trade/location/trade-location-scope";
import {
  sanitizeTradeBrowseRadiusKm,
  TRADE_BROWSE_RECOMMENDED_RADIUS_KM,
} from "@/lib/trade/location/trade-browse-radius";

describe("Phase 4 URL canonicalization", () => {
  it("missing radius on city → recommended 64", () => {
    const s = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=quezon-city")
    );
    expect(s.mode).toBe("city");
    if (s.mode === "city") expect(s.radiusKm).toBe(TRADE_BROWSE_RECOMMENDED_RADIUS_KM);
  });

  it("invalid / 0 / negative / over-max / decimal normalize", () => {
    expect(sanitizeTradeBrowseRadiusKm("abc")).toBe(64);
    expect(sanitizeTradeBrowseRadiusKm(0)).toBe(1);
    expect(sanitizeTradeBrowseRadiusKm(-12)).toBe(1);
    expect(sanitizeTradeBrowseRadiusKm(9999)).toBe(500);
    expect(sanitizeTradeBrowseRadiusKm("32.9")).toBe(32);
  });

  it("invalid LGU is not silent ALL", () => {
    const s = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=not-a-city&radius=64")
    );
    expect(s).toEqual({ mode: "invalid", raw: "not-a-city" });
  });

  it("ALL apply writes location=all and strips lgu/radius leftovers", () => {
    const next = applyTradeLocationScopeToSearchParams(
      new URLSearchParams("location=city&lgu=pasig&radius=160&foo=1"),
      { mode: "all" }
    );
    expect(next.get("location")).toBe("all");
    expect(next.get("lgu")).toBeNull();
    expect(next.get("radius")).toBeNull();
    expect(next.get("foo")).toBe("1");
  });

  it("duplicate radius params use first URLSearchParams get", () => {
    const s = parseTradeLocationScopeFromSearchParams(
      new URLSearchParams("location=city&lgu=pasig&radius=32&radius=160")
    );
    expect(s.mode).toBe("city");
    if (s.mode === "city") expect(s.radiusKm).toBe(32);
  });

  it("href serialize includes radius for city", () => {
    const href = buildTradeLocationHref("/market", "", {
      mode: "city",
      lguId: "pasig",
      canonicalId: "1381200000",
      radiusKm: 96,
    });
    expect(href).toContain("location=city");
    expect(href).toContain("lgu=pasig");
    expect(href).toContain("radius=96");
    expect(tradeLocationScopeCacheSegment({
      mode: "city",
      lguId: "pasig",
      canonicalId: "1381200000",
      radiusKm: 96,
    })).toBe("loc:lgu:1381200000:r:96");
  });
});
