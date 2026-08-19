import { describe, expect, it } from "vitest";
import {
  listingMatchesMetaCatalogHints,
  resolveProfileMetaCatalogMatches,
} from "@/lib/trade/marketplace/search-expansion-profile-hints";
import {
  buildSearchExpansionRelatedOrFilter,
  classifySearchExpansionTier,
  resolveSearchExpansionHints,
} from "@/lib/trade/marketplace/search-candidate-expansion";

describe("CUT-SSOT-2 profile search hints", () => {
  it("maps 페소 팝니다 to exchange_direction sell meta", () => {
    const matches = resolveProfileMetaCatalogMatches("페소 팝니다", ["페소", "팝니다"]);
    expect(matches.some((m) => m.metaKey === "exchange_direction" && m.value === "sell")).toBe(true);
  });

  it("includes meta eq in related OR filter", () => {
    const hints = resolveSearchExpansionHints("페소 팝니다")!;
    const relatedOr = buildSearchExpansionRelatedOrFilter(hints);
    expect(relatedOr).toContain("meta->>exchange_direction.eq.sell");
  });

  it("classifies exchange listing via meta catalog (T2) without title phrase", () => {
    const hints = resolveSearchExpansionHints("페소 팝니다")!;
    expect(
      listingMatchesMetaCatalogHints({ exchange_direction: "sell" }, hints.metaCatalogMatches)
    ).toBe(true);
    expect(
      classifySearchExpansionTier(
        {
          title: "Selling pesos",
          meta: { exchange_direction: "sell" },
          trade_lgu_id: "1381200000",
        },
        hints,
        "1381200000"
      )
    ).toBe(2);
  });
});
