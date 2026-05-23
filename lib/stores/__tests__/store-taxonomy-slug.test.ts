import { describe, expect, it } from "vitest";
import { slugifyStoreTaxonomyLoose } from "@/lib/stores/store-taxonomy-slug";

describe("slugifyStoreTaxonomyLoose", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugifyStoreTaxonomyLoose("Korean BBQ")).toBe("korean-bbq");
  });

  it("strips non-ascii and collapses hyphens", () => {
    expect(slugifyStoreTaxonomyLoose("  약국 & Health!!  ")).toBe("health");
  });

  it("returns empty for punctuation-only input", () => {
    expect(slugifyStoreTaxonomyLoose("!!!")).toBe("");
  });
});
