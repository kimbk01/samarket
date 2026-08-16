import { describe, expect, it } from "vitest";
import {
  formatTradeMeetSpotLineForList,
  resolveTradeListingPublicCityLabel,
  resolveTradePostListingLocationLine,
} from "@/lib/posts/post-listing-location-label";
import { buildTradeMeetSpotMetaForPersist } from "@/lib/posts/trade-meet-spot-types";

describe("resolveTradeListingPublicCityLabel", () => {
  it("prefers trade_lgu_id product City over meet_spot and local Area", () => {
    const label = resolveTradeListingPublicCityLabel({
      tradeLguId: "1381200000", // Pasig
      region: "manila",
      city: "m20",
    });
    expect(label).toBe("Pasig City");
  });

  it("ignores meet_spot even when passed via deprecated wrapper", () => {
    const label = resolveTradePostListingLocationLine(
      {
        trade_meet_spot: {
          display_line: "123 Fake Street\nUnit 5\nPayatas, Quezon City",
        },
      },
      "manila",
      "m20",
      "1381200000"
    );
    expect(label).toBe("Pasig City");
    expect(label).not.toMatch(/Fake|Unit|Payatas|123/i);
  });

  it("falls back to rollup City when trade_lgu_id is null", () => {
    const label = resolveTradeListingPublicCityLabel({
      tradeLguId: null,
      region: "manila",
      city: "m20",
    });
    expect(label).toBe("Pasig City");
  });

  it("resolves nationwide PSGC display name from slim map", () => {
    const label = resolveTradeListingPublicCityLabel({
      tradeLguId: "1130700000", // Davao City (from n3 tests)
      region: null,
      city: null,
    });
    expect(label).toBeTruthy();
    expect(label).not.toMatch(/^\d/);
    expect(label?.toLowerCase()).toContain("davao");
  });

  it("never returns raw coordinates as City", () => {
    const label = resolveTradePostListingLocationLine(
      { trade_meet_spot: { display_line: "14.5995, 120.9842", lat: 14.5995, lng: 120.9842 } },
      null,
      null,
      null
    );
    expect(label).toBeNull();
  });
});

describe("formatTradeMeetSpotLineForList", () => {
  it("still shortens meet lines for non-card consumers", () => {
    const short = formatTradeMeetSpotLineForList("SM Megamall\nEDSA\nOrtigas, Pasig City");
    expect(short).toBe("SM Megamall · Pasig City");
  });
});

describe("buildTradeMeetSpotMetaForPersist", () => {
  it("returns null when meet spot was not picked", () => {
    expect(buildTradeMeetSpotMetaForPersist(null)).toBeNull();
    expect(buildTradeMeetSpotMetaForPersist({ displayLine: "  " })).toBeNull();
  });

  it("persists explicit meet spot without inventing master TITLE", () => {
    const meta = buildTradeMeetSpotMetaForPersist({
      displayLine: "Ayala Triangle Gardens",
      lat: 14.55,
      lng: 121.02,
      placeId: "ChIJtest",
    });
    expect(meta).toEqual({
      trade_meet_spot: {
        display_line: "Ayala Triangle Gardens",
        lat: 14.55,
        lng: 121.02,
        place_id: "ChIJtest",
      },
    });
  });
});
