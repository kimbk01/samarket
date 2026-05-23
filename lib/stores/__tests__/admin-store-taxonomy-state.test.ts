import { describe, expect, it } from "vitest";
import {
  mergeAdminTaxonomyState,
  upsertCategoryInState,
} from "@/lib/stores/admin-store-taxonomy-state";

describe("mergeAdminTaxonomyState", () => {
  it("keeps row reference when server payload unchanged", () => {
    const cat = {
      id: "c1",
      name: "식당",
      slug: "restaurant",
      sort_order: 10,
      is_active: true,
      image_url: "https://example.com/a.png",
    };
    const prev = { categories: [cat], topics: [], subtopics: [] };
    const next = {
      categories: [{ ...cat }],
      topics: [],
      subtopics: [],
    };
    const merged = mergeAdminTaxonomyState(prev, next);
    expect(merged.categories[0]).toBe(cat);
  });

  it("replaces reference when row data changed", () => {
    const cat = {
      id: "c1",
      name: "식당",
      slug: "restaurant",
      sort_order: 10,
      is_active: true,
    };
    const prev = { categories: [cat], topics: [], subtopics: [] };
    const next = {
      categories: [{ ...cat, name: "음식점" }],
      topics: [],
      subtopics: [],
    };
    const merged = mergeAdminTaxonomyState(prev, next);
    expect(merged.categories[0]).not.toBe(cat);
    expect(merged.categories[0]?.name).toBe("음식점");
  });
});

describe("upsertCategoryInState", () => {
  it("keeps row reference when PATCH payload matches existing row", () => {
    const cat = {
      id: "c1",
      name: "식당",
      slug: "restaurant",
      sort_order: 10,
      is_active: true,
      image_url: "https://example.com/a.png",
    };
    const state = { categories: [cat], topics: [], subtopics: [] };
    const next = upsertCategoryInState(state, { ...cat });
    expect(next.categories[0]).toBe(cat);
  });
});
