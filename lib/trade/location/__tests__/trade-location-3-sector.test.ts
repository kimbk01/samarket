import { describe, expect, it } from "vitest";
import { listTradeLguCities } from "@/lib/trade/location/trade-lgu-city-rollup";
import {
  getTradeLguNearbySource,
  resolveTradeLguNearbyCities,
} from "@/lib/trade/location/trade-lgu-adjacency";
import {
  countUniqueTradeLguCities,
  listTradeLguPickerGroups,
} from "@/lib/trade/location/trade-lgu-picker-groups";

describe("trade location 3-sector helpers", () => {
  it("unique LGU count matches rollup list", () => {
    expect(countUniqueTradeLguCities()).toBe(listTradeLguCities().length);
    expect(countUniqueTradeLguCities()).toBe(29);
  });

  it("nearby uses explicit adjacency and excludes self", () => {
    expect(getTradeLguNearbySource()).toBe("explicit_adjacency_table");
    const near = resolveTradeLguNearbyCities("pasig");
    expect(near.map((c) => c.id)).toEqual([
      "makati",
      "mandaluyong",
      "quezon-city",
      "taguig",
    ]);
    expect(near.every((c) => c.id !== "pasig")).toBe(true);
    expect(near.length).toBeLessThanOrEqual(4);
  });

  it("picker groups cover every unique LGU once", () => {
    const groups = listTradeLguPickerGroups();
    const ids = groups.flatMap((g) => g.cities.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(countUniqueTradeLguCities());
  });
});
