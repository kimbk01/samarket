import { describe, expect, it } from "vitest";
import { REGIONS } from "@/lib/products/regions-data";
import {
  auditTradeLguRollupCoverage,
  getTradeLguCityDef,
  resolveTradeInternalCityIdsForLgu,
  resolveTradeLguCityFromInternal,
  resolveTradeLguCityQueryConstraint,
} from "@/lib/trade/location/trade-lgu-city-rollup";

describe("trade LGU city rollup", () => {
  it("maps 100% of REGIONS taxonomy city ids", () => {
    const cov = auditTradeLguRollupCoverage();
    expect(cov.unmapped).toEqual([]);
    expect(cov.ambiguous).toEqual([]);
    expect(cov.mapped).toBe(cov.totalInternalIds);
    expect(cov.totalInternalIds).toBe(
      REGIONS.reduce((n, r) => n + r.cities.length, 0)
    );
  });

  it("Pasig City includes m20/m21/m22 and query uses city IN", () => {
    const pasig = getTradeLguCityDef("pasig");
    expect(pasig?.displayName).toBe("Pasig City");
    const ids = resolveTradeInternalCityIdsForLgu("pasig").map((m) => m.cityId).sort();
    expect(ids).toEqual(["m20", "m21", "m22"]);
    const q = resolveTradeLguCityQueryConstraint("pasig");
    expect(q).toEqual({ regionId: "manila", cityIds: ["m20", "m21", "m22"] });
  });

  it("Quezon City rolls up all q* under region quezon", () => {
    const q = resolveTradeLguCityFromInternal("quezon", "q1");
    expect(q?.id).toBe("quezon-city");
    expect(q?.displayName).toBe("Quezon City");
    const members = resolveTradeInternalCityIdsForLgu("quezon-city");
    expect(members.length).toBe(REGIONS.find((r) => r.id === "quezon")!.cities.length);
    expect(members.every((m) => m.regionId === "quezon")).toBe(true);
  });

  it("Makati City includes m2/m39/m40", () => {
    const ids = resolveTradeInternalCityIdsForLgu("makati").map((m) => m.cityId).sort();
    expect(ids).toEqual(["m2", "m39", "m40"]);
  });

  it("does not treat single neighborhood as whole LGU falsely", () => {
    expect(resolveTradeLguCityFromInternal("manila", "m20")?.id).toBe("pasig");
    expect(resolveTradeLguCityFromInternal("manila", "m2")?.id).toBe("makati");
  });
});
