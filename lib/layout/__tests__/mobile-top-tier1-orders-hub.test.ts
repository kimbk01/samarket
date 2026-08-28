import { describe, expect, it } from "vitest";
import { getMobileTopTier1RuleSet } from "@/lib/layout/mobile-top-tier1-rules";

describe("getMobileTopTier1RuleSet orders hub", () => {
  it("/orders and /orders/activity use RegionBar (shared commerce hub chrome)", () => {
    expect(getMobileTopTier1RuleSet("/orders").showRegionBar).toBe(true);
    expect(getMobileTopTier1RuleSet("/orders/").showRegionBar).toBe(true);
    expect(getMobileTopTier1RuleSet("/orders/activity").showRegionBar).toBe(true);
  });

  it("/stores/gift-mall uses RegionBar (customer gift commerce safe-top SSOT)", () => {
    expect(getMobileTopTier1RuleSet("/stores/gift-mall").showRegionBar).toBe(true);
    expect(getMobileTopTier1RuleSet("/stores/gift-mall/abc-product").showRegionBar).toBe(true);
  });

  it("/stores/store-slug still suppresses global tier1 (local store chrome)", () => {
    expect(getMobileTopTier1RuleSet("/stores/some-store").showRegionBar).toBe(false);
  });
});
