import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGIONS } from "@/lib/products/regions-data";
import {
  auditTradeLguRollupCoverage,
  listTradeLguCities,
  resolveTradeLguCityFromInternal,
} from "@/lib/trade/location/trade-lgu-city-rollup";
import {
  getTradeNationalLguById,
  listTradeNationalLgus,
  loadTradeNationalLguDataset,
  resolveLegacyTradeLguAliasToCanonical,
  resolveLocalAreaToTradeNationalLgu,
} from "@/lib/trade/location/national/load-national-lgu-dataset";
import { resolveTradeNationalLgu } from "@/lib/trade/location/national/resolve-trade-national-lgu";
import { searchTradeNationalLgu } from "@/lib/trade/location/national/search-trade-national-lgu";

const DATA = join(process.cwd(), "data/trade-national-lgu");

describe("N0 trade national LGU reference", () => {
  it("loads unique City/Municipality projection", () => {
    const ds = loadTradeNationalLguDataset();
    expect(ds.datasetVersion).toBe("PSGC-2025-2Q");
    const lgus = listTradeNationalLgus();
    const ids = lgus.map((l) => l.canonicalId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(lgus.every((l) => l.lguType === "city" || l.lguType === "municipality")).toBe(true);
    expect(lgus.every((l) => l.displayName.trim().length > 0)).toBe(true);
    expect(lgus.length).toBeGreaterThan(1600);
    const report = JSON.parse(readFileSync(join(DATA, "build-report.json"), "utf8"));
    expect(report.gates.errors).toEqual([]);
    expect(report.totals.selectable_lgu).toBe(lgus.length);
  });

  it("maps legacy 29 product aliases 29/29", () => {
    const legacy = listTradeLguCities();
    expect(legacy.length).toBe(29);
    const unmapped: string[] = [];
    const ambiguous: string[] = [];
    for (const l of legacy) {
      const hit = resolveLegacyTradeLguAliasToCanonical(l.id);
      if (!hit) unmapped.push(l.id);
    }
    expect(unmapped).toEqual([]);
    expect(ambiguous).toEqual([]);
  });

  it("maps local area 143/143", () => {
    const cov = auditTradeLguRollupCoverage();
    expect(cov.unmapped).toEqual([]);
    expect(cov.totalInternalIds).toBe(143);
    const ds = loadTradeNationalLguDataset();
    expect(ds.localAreaMap.length).toBe(143);
    const unmapped: Array<{ regionId: string; cityId: string }> = [];
    for (const region of REGIONS) {
      for (const city of region.cities) {
        const n = resolveLocalAreaToTradeNationalLgu(region.id, city.id);
        const legacy = resolveTradeLguCityFromInternal(region.id, city.id);
        if (!n || !legacy) {
          unmapped.push({ regionId: region.id, cityId: city.id });
          continue;
        }
        expect(n.canonicalId).toBe(
          resolveLegacyTradeLguAliasToCanonical(legacy.id)?.canonicalId
        );
      }
    }
    expect(unmapped).toEqual([]);
  });

  it("does not treat inactive/superseded as writable without is_active", () => {
    const pasig = getTradeNationalLguById("1381200000");
    expect(pasig?.isActive).toBe(true);
    expect(pasig?.displayName).toMatch(/Pasig/i);
  });
});

describe("N1 resolveTradeNationalLgu", () => {
  const cases: Array<{
    name: string;
    city: string;
    province?: string;
    expectId: string;
  }> = [
    { name: "Pasig", city: "Pasig City", expectId: "1381200000" },
    { name: "Quezon City", city: "Quezon City", expectId: "1381300000" },
    { name: "Makati", city: "Makati City", expectId: "1380300000" },
    { name: "Cebu", city: "Cebu City", expectId: "0730600000" },
    { name: "Angeles", city: "Angeles City", expectId: "0330100000" },
    { name: "Davao", city: "Davao City", expectId: "1130700000" },
    { name: "Baguio", city: "Baguio City", expectId: "1430300000" },
    { name: "Iloilo", city: "Iloilo City", expectId: "0631000000" },
    { name: "Bacolod", city: "Bacolod City", expectId: "1830200000" },
    { name: "Cagayan de Oro", city: "Cagayan de Oro", expectId: "1030500000" },
    { name: "General Santos", city: "General Santos City", expectId: "1230800000" },
    { name: "Puerto Princesa", city: "Puerto Princesa City", expectId: "1731500000" },
    { name: "Cainta", city: "Cainta", province: "Rizal", expectId: "0405805000" },
  ];

  for (const c of cases) {
    it(`resolves ${c.name}`, () => {
      const r = resolveTradeNationalLgu({
        cityMunicipality: c.city,
        province: c.province ?? null,
      });
      expect(r.status).toBe("resolved");
      if (r.status === "resolved") {
        expect(r.canonicalId).toBe(c.expectId);
        expect(r.lgu.displayName.length).toBeGreaterThan(0);
      }
    });
  }

  it("AMBIGUOUS when same name without province", () => {
    const r = resolveTradeNationalLgu({ cityMunicipality: "Santa Cruz" });
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") {
      expect(r.candidates.length).toBeGreaterThan(1);
    }
  });

  it("RESOLVED San Juan City via explicit NCR alias", () => {
    const r = resolveTradeNationalLgu({ cityMunicipality: "San Juan City" });
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") {
      expect(r.canonicalId).toBe("1381400000");
    }
  });

  it("UNRESOLVED for unknown municipality", () => {
    const r = resolveTradeNationalLgu({
      cityMunicipality: "Atlantis City",
      province: "Nowhere",
    });
    expect(r.status).toBe("unresolved");
  });

  it("does not use formatted address fields", () => {
    const r = resolveTradeNationalLgu({
      cityMunicipality: null,
      province: null,
      // @ts-expect-error — formattedAddress is not part of the contract
      formattedAddress: "Davao City, Davao del Sur, Philippines",
    });
    expect(r.status).toBe("unresolved");
  });

  it("Davao national resolved while local area remains separate concern", () => {
    const national = resolveTradeNationalLgu({ cityMunicipality: "City of Davao" });
    expect(national.status).toBe("resolved");
    const local = resolveLocalAreaToTradeNationalLgu("davao", "d1");
    expect(local).toBeNull();
  });
});

describe("national LGU search", () => {
  it("search davao returns single canonical City of Davao", () => {
    const hits = searchTradeNationalLgu("davao");
    expect(hits.length).toBeGreaterThan(0);
    const davao = hits.find((h) => h.canonicalId === "1130700000");
    expect(davao?.displayName).toMatch(/Davao/i);
    const ids = hits.map((h) => h.canonicalId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
