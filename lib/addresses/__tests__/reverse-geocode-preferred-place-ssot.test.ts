import { describe, expect, it } from "vitest";
import { samePlaceToleranceMeters } from "@/lib/addresses/reverse-geocode-ph-client";
import { PLACE_FIELDS_DISPLAY_DETAIL, PLACE_FIELDS_POI_FULL } from "@/lib/map/places-new-api";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("samePlaceToleranceMeters — no magic 18m sole authority", () => {
  it("uses larger tolerance for shopping_mall / hospital / school", () => {
    expect(samePlaceToleranceMeters(["shopping_mall"])).toBeGreaterThanOrEqual(400);
    expect(samePlaceToleranceMeters(["hospital"])).toBeGreaterThanOrEqual(400);
    expect(samePlaceToleranceMeters(["university"])).toBeGreaterThanOrEqual(400);
  });

  it("uses default tolerance for ordinary types", () => {
    expect(samePlaceToleranceMeters(["store"])).toBe(120);
    expect(samePlaceToleranceMeters(undefined)).toBe(120);
  });
});

describe("Places Details field SSOT — PIN prefer needs geometry", () => {
  it("PLACE_FIELDS_DISPLAY_DETAIL includes location", () => {
    expect(PLACE_FIELDS_DISPLAY_DETAIL).toContain("location");
  });

  it("PLACE_FIELDS_POI_FULL includes location + displayName", () => {
    expect(PLACE_FIELDS_POI_FULL).toContain("location");
    expect(PLACE_FIELDS_POI_FULL).toContain("displayName");
  });

  it("reverse-geocode prefer path uses PLACE_FIELDS_POI_FULL (geometry)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/addresses/reverse-geocode-ph-client.ts"),
      "utf8"
    );
    expect(src).toContain("PLACE_FIELDS_POI_FULL");
    expect(src).toContain("isPinWithinPreferredPlace");
    expect(src).toContain("samePlaceAsPreferred");
    expect(src).not.toMatch(/TIGHT_NEARBY_MAX_METERS\s*=\s*18/);
  });

  it("applyFineTune preserves unitFloorRoom on same-place pin", () => {
    const src = readFileSync(
      join(process.cwd(), "components/addresses/AddressEditorSheet.tsx"),
      "utf8"
    );
    expect(src).toContain("samePlaceAsPreferred");
    expect(src).toMatch(/if\s*\(\s*!r\.samePlaceAsPreferred\s*\)\s*\{\s*setUnitFloorRoom\(""\)/);
  });
});
