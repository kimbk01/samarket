import { describe, expect, it } from "vitest";
import {
  listBrowseSubIndustriesForPrimary,
  mergeBrowsePrimaryIndustries,
  parseBrowseTaxonomyPayload,
  resolveBrowsePrimaryEntryHref,
} from "@/lib/stores/browse-taxonomy-resolvers";

describe("browse-taxonomy-resolvers (CUT 1 taxonomy SSOT)", () => {
  it("parseBrowseTaxonomyPayload rejects invalid", () => {
    expect(parseBrowseTaxonomyPayload({ ok: false })).toBeNull();
    expect(parseBrowseTaxonomyPayload({ ok: true, categories: [] })).toBeNull();
  });

  it("mergeBrowsePrimaryIndustries returns empty without taxonomy (no seed merge)", () => {
    expect(mergeBrowsePrimaryIndustries(null)).toEqual([]);
  });

  it("mergeBrowsePrimaryIndustries orders by sort_order including non-seed slugs", () => {
    const taxonomy = parseBrowseTaxonomyPayload({
      ok: true,
      categories: [
        { id: "c2", name: "B", slug: "beta", sort_order: 20 },
        { id: "c1", name: "A", slug: "alpha", sort_order: 10 },
      ],
      topics: [],
    });
    expect(mergeBrowsePrimaryIndustries(taxonomy).map((p) => p.slug)).toEqual(["alpha", "beta"]);
  });

  it("listBrowseSubIndustriesForPrimary filters by category without seed fallback", () => {
    const taxonomy = parseBrowseTaxonomyPayload({
      ok: true,
      categories: [{ id: "c1", name: "식당", slug: "restaurant", sort_order: 0 }],
      topics: [
        { id: "t1", store_category_id: "c1", name: "한식", slug: "korean", sort_order: 0 },
        { id: "t2", store_category_id: "c1", name: "중식", slug: "chinese", sort_order: 1 },
      ],
    });
    const subs = listBrowseSubIndustriesForPrimary(taxonomy, "restaurant");
    expect(subs.map((s) => s.slug)).toEqual(["korean", "chinese"]);
    expect(listBrowseSubIndustriesForPrimary(null, "restaurant")).toEqual([]);
  });

  it("resolveBrowsePrimaryEntryHref uses sub=all", () => {
    const { path } = resolveBrowsePrimaryEntryHref("restaurant");
    expect(path).toBe("/stores/browse/restaurant?sub=all");
  });
});
