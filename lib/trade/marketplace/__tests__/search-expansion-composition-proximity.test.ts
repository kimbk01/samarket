import { describe, expect, it } from "vitest";
import { listingMatchesCompositionProximity } from "@/lib/trade/marketplace/search-expansion-composition-proximity";
import { resolveSearchExpansionHints } from "@/lib/trade/marketplace/search-candidate-expansion";

describe("CUT-SSOT-3 composition proximity (T3)", () => {
  it("matches inferred body_type from exact tier", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    expect(
      listingMatchesCompositionProximity(
        { title: "Montero Sport", meta: { car_body_type: "suv" } },
        hints,
        ["suv"]
      )
    ).toBe(true);
  });

  it("matches profile meta catalog value from hints", () => {
    const hints = resolveSearchExpansionHints("페소 팝니다")!;
    expect(hints?.metaCatalogMatches.length).toBeGreaterThan(0);
    expect(
      listingMatchesCompositionProximity(
        {
          title: "USD exchange",
          meta: { exchange_direction: hints!.metaCatalogMatches[0]!.value },
        },
        hints!
      )
    ).toBe(true);
  });

  it("does not treat unrelated listings as composition proximity", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    expect(
      listingMatchesCompositionProximity(
        { title: "Samsung fridge", meta: {} },
        hints!,
        ["suv"]
      )
    ).toBe(false);
  });
});
