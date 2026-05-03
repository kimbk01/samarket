import { describe, expect, it } from "vitest";
import { matchRegionCityFromFullAddress } from "../match-region-from-full-address";

describe("matchRegionCityFromFullAddress", () => {
  it("matches Parañaque when Google returns city name without catalog sub-area suffix", () => {
    const line =
      "COD corner Roxas Boulevard Entertainment City Manila, Parañaque";
    const hit = matchRegionCityFromFullAddress(line);
    expect(hit?.regionId).toBe("manila");
    expect(hit?.cityId === "m25" || hit?.cityId === "m26").toBe(true);
  });

  it("matches ASCII Paranaque without tilde", () => {
    const line = "Some street Manila, Paranaque";
    const hit = matchRegionCityFromFullAddress(line);
    expect(hit?.regionId).toBe("manila");
    expect(hit?.cityId === "m25" || hit?.cityId === "m26").toBe(true);
  });

  it("prefers full catalog city line when present in address", () => {
    const line = "Near Parañaque – Baclaran jeep terminal, Manila area";
    const hit = matchRegionCityFromFullAddress(line);
    expect(hit).toEqual({ regionId: "manila", cityId: "m26" });
  });

  it("matches Quezon City + barangay-style English line", () => {
    const line =
      "St. Peter Parish Shrine Commonwealth Avenue Quezon City Philippines";
    const hit = matchRegionCityFromFullAddress(line);
    expect(hit?.regionId).toBe("quezon");
    expect(hit?.cityId).toBeTruthy();
  });

  it("matches POI title with city only (no Manila / Metro in line)", () => {
    const line = "Medley Buffet Parañaque";
    const hit = matchRegionCityFromFullAddress(line);
    expect(hit?.regionId).toBe("manila");
    expect(hit?.cityId === "m25" || hit?.cityId === "m26").toBe(true);
  });
});
