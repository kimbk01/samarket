import { describe, expect, it } from "vitest";
import { inferTradeRegionCityFromMeetSpot } from "../infer-trade-region-from-meet-spot";

describe("inferTradeRegionCityFromMeetSpot", () => {
  it("uses valid app ids when present", () => {
    expect(
      inferTradeRegionCityFromMeetSpot({
        displayLine: "Anything",
        appRegionId: "quezon",
        appCityId: "q3",
      })
    ).toEqual({ regionId: "quezon", cityId: "q3" });
  });

  it("ignores invalid app ids and falls back to display line matching", () => {
    const hit = inferTradeRegionCityFromMeetSpot({
      displayLine: "Medley Buffet Parañaque",
      appRegionId: "bogus",
      appCityId: "x99",
    });
    expect(hit?.regionId).toBe("manila");
    expect(hit?.cityId === "m25" || hit?.cityId === "m26").toBe(true);
  });

  it("returns null without display line", () => {
    expect(inferTradeRegionCityFromMeetSpot({ displayLine: "" })).toBeNull();
    expect(inferTradeRegionCityFromMeetSpot(null)).toBeNull();
  });
});
