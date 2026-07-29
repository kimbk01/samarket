import { describe, expect, it } from "vitest";
import { resolveStoresHomePrewarmFeedSuffixes } from "@/lib/stores/stores-home-route-prewarm";

describe("resolveStoresHomePrewarmFeedSuffixes", () => {
  it("warms root only when no regional suffixes", () => {
    expect(resolveStoresHomePrewarmFeedSuffixes()).toEqual([""]);
    expect(resolveStoresHomePrewarmFeedSuffixes([])).toEqual([""]);
  });

  it("does not union empty root when regional suffixes are provided", () => {
    expect(
      resolveStoresHomePrewarmFeedSuffixes(["?region=Manila&district=1234"])
    ).toEqual(["?region=Manila&district=1234"]);
  });

  it("dedupes requested suffixes", () => {
    expect(
      resolveStoresHomePrewarmFeedSuffixes([
        "?region=Manila",
        "?region=Manila",
        "?region=Manila&district=1234",
      ])
    ).toEqual(["?region=Manila", "?region=Manila&district=1234"]);
  });
});
