import { describe, expect, it } from "vitest";
import { REGIONS } from "./regions-data";
import {
  getPhilippinesZipCodesForLocation,
  lookupLocationByPhilippinesZip,
} from "./zip-to-location";

describe("getPhilippinesZipCodesForLocation", () => {
  it("returns sorted codes that resolve back to the same location", () => {
    const codes = getPhilippinesZipCodesForLocation("quezon", "q3");
    expect(codes.length).toBeGreaterThan(0);
    expect(codes[0]).toMatch(/^\d{4}$/);
    for (const z of codes.slice(0, 5)) {
      const hit = lookupLocationByPhilippinesZip(z);
      expect(hit).toEqual({ regionId: "quezon", cityId: "q3" });
    }
  });

  it("returns empty when ids missing", () => {
    expect(getPhilippinesZipCodesForLocation("", "q3")).toEqual([]);
    expect(getPhilippinesZipCodesForLocation("quezon", "")).toEqual([]);
  });

  it("every region·city in REGIONS has at least one ZIP (round-trip)", () => {
    for (const r of REGIONS) {
      for (const c of r.cities) {
        const codes = getPhilippinesZipCodesForLocation(r.id, c.id);
        expect(codes.length, `${r.id}|${c.id} ${c.name}`).toBeGreaterThan(0);
        const hit = lookupLocationByPhilippinesZip(codes[0]!);
        expect(hit).toEqual({ regionId: r.id, cityId: c.id });
      }
    }
  });
});
