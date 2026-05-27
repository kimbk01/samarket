import { describe, expect, it } from "vitest";
import { BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER } from "@/lib/stores/browse-primary-industry-display";
import {
  mergeBrowsePrimaryIndustries,
  listBrowseSubIndustriesForPrimary,
  parseBrowseTaxonomyPayload,
  resolveBrowsePrimaryEntryHref,
} from "@/lib/stores/browse-taxonomy-resolvers";

describe("browse-taxonomy-resolvers", () => {
  it("parseBrowseTaxonomyPayload rejects invalid", () => {
    expect(parseBrowseTaxonomyPayload({ ok: false })).toBeNull();
    expect(parseBrowseTaxonomyPayload({ ok: true, categories: [] })).toBeNull();
  });

  it("mergeBrowsePrimaryIndustries keeps 8 slugs in fixed order", () => {
    const items = mergeBrowsePrimaryIndustries(null);
    expect(items.map((p) => p.slug)).toEqual([...BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER]);
  });

  it("listBrowseSubIndustriesForPrimary filters by category", () => {
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
  });

  it("resolveBrowsePrimaryEntryHref uses sub=all", () => {
    const { path } = resolveBrowsePrimaryEntryHref("restaurant");
    expect(path).toBe("/stores/browse/restaurant?sub=all");
  });
});
