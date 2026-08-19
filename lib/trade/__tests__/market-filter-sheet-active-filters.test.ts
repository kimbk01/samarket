import { describe, expect, it } from "vitest";
import { countActiveMarketFilters } from "@/components/trade/MarketFilterSheet";

describe("MarketFilterSheet active filter count", () => {
  it("counts explicit filters[...] composition params", () => {
    const n = countActiveMarketFilters(
      "category=used-car&filters[make]=toyota&filters[body_type]=suv"
    );
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it("does not count empty filters[...] values", () => {
    const base = countActiveMarketFilters("category=used-car");
    const withEmpty = countActiveMarketFilters("category=used-car&filters[make]=");
    expect(withEmpty).toBe(base);
  });
});
