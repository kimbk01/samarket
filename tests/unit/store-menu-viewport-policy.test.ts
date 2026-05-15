import { describe, expect, it } from "vitest";
import {
  initialDeferredHydratedThroughIndex,
  shouldDeferMenuSectionHydration,
  shouldVirtualizeMenuSection,
} from "@/lib/dibay/store-menu-viewport-policy";
import type { MenuSection } from "@/lib/stores/group-store-products-by-menu";

function sectionsWithCounts(counts: number[]): MenuSection[] {
  return counts.map((n, i) => ({
    heading: `sec-${i}`,
    listHeading: `sec-${i}`,
    items: Array.from({ length: n }, (_, j) => ({
      id: `${i}-${j}`,
      title: "item",
      price: 100,
    })) as MenuSection["items"],
  }));
}

describe("store-menu-viewport-policy", () => {
  it("defers when flat count exceeds threshold", () => {
    expect(shouldDeferMenuSectionHydration(sectionsWithCounts([30, 30]))).toBe(true);
    expect(shouldDeferMenuSectionHydration(sectionsWithCounts([10, 10]))).toBe(false);
  });

  it("hydrates initial sections within budget", () => {
    const through = initialDeferredHydratedThroughIndex(sectionsWithCounts([20, 20, 20, 20]));
    expect(through).toBeGreaterThanOrEqual(1);
  });

  it("virtualizes large board sections softly", () => {
    expect(shouldVirtualizeMenuSection(25, 80)).toBe(true);
    expect(shouldVirtualizeMenuSection(10, 30)).toBe(false);
  });
});
