import { describe, expect, it } from "vitest";
import { getMobileTopTier1RuleSet } from "@/lib/layout/mobile-top-tier1-rules";

describe("getMobileTopTier1RuleSet orders hub", () => {
  it("/orders 루트는 전역 1단 숨김(OrdersHubContent AppTopHeader 단독)", () => {
    expect(getMobileTopTier1RuleSet("/orders").showRegionBar).toBe(false);
    expect(getMobileTopTier1RuleSet("/orders/").showRegionBar).toBe(false);
  });

  it("/orders/store/... 상세는 1단 유지", () => {
    expect(getMobileTopTier1RuleSet("/orders/store/abc").showRegionBar).toBe(true);
  });
});
