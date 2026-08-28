import { describe, expect, it } from "vitest";
import { getMobileTopTier1RuleSet } from "@/lib/layout/mobile-top-tier1-rules";

describe("getMobileTopTier1RuleSet orders hub", () => {
  it("/orders and /orders/activity use RegionBar (shared commerce hub chrome)", () => {
    expect(getMobileTopTier1RuleSet("/orders").showRegionBar).toBe(true);
    expect(getMobileTopTier1RuleSet("/orders/").showRegionBar).toBe(true);
    expect(getMobileTopTier1RuleSet("/orders/activity").showRegionBar).toBe(true);
  });

  it("/orders/store/... detail keeps tier1", () => {
    expect(getMobileTopTier1RuleSet("/orders/store/abc").showRegionBar).toBe(true);
  });
});
