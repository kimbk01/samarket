import { describe, expect, it } from "vitest";
import { parseStoresHomeTaxonomyJson } from "@/lib/stores/stores-home-taxonomy-client";

describe("parseStoresHomeTaxonomyJson", () => {
  it("returns null for empty categories", () => {
    expect(parseStoresHomeTaxonomyJson({ ok: true, categories: [], topics: [] })).toBeNull();
  });

  it("parses valid payload", () => {
    const out = parseStoresHomeTaxonomyJson({
      ok: true,
      categories: [{ id: "c1", slug: "restaurant", sort_order: 0 }],
      topics: [{ id: "t1", store_category_id: "c1", slug: "korean", sort_order: 0 }],
    });
    expect(out?.categories).toHaveLength(1);
    expect(out?.topics).toHaveLength(1);
  });
});
