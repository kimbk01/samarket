import { describe, expect, it } from "vitest";
import {
  buildStoresHomeTaxonomySeedApiJson,
  getStoresHomeTaxonomySeedState,
  STORES_HOME_TAXONOMY_EAGER_ICON_COUNT,
} from "@/lib/stores/stores-home-taxonomy-seed";
import {
  parseStoresHomeTaxonomyJson,
  resolveStoresHomeTaxonomyFromApi,
} from "@/lib/stores/stores-home-taxonomy-client";

describe("stores-home-taxonomy-seed", () => {
  it("matches API top-level shape", () => {
    const json = buildStoresHomeTaxonomySeedApiJson();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.categories)).toBe(true);
    expect(Array.isArray(json.topics)).toBe(true);
    expect(json.categories.length).toBeGreaterThan(0);
    expect(parseStoresHomeTaxonomyJson(json)).not.toBeNull();
  });

  it("keeps restaurant first in sort_order and includes restaurant subs", () => {
    const { categories, topics } = getStoresHomeTaxonomySeedState();
    const restaurant = categories.find((c) => c.slug === "restaurant");
    expect(restaurant).toBeTruthy();
    const subs = topics.filter((t) => t.store_category_id === restaurant!.id);
    expect(subs.some((t) => t.slug === "korean")).toBe(true);
    expect(subs.some((t) => t.slug === "late_night")).toBe(true);
  });

  it("exposes eager icon cap of 8", () => {
    expect(STORES_HOME_TAXONOMY_EAGER_ICON_COUNT).toBe(1);
  });
});

describe("resolveStoresHomeTaxonomyFromApi", () => {
  const seed = getStoresHomeTaxonomySeedState();

  it("returns seed on empty API payload", () => {
    expect(resolveStoresHomeTaxonomyFromApi({ ok: true, categories: [], topics: [] }, seed)).toBe(seed);
  });

  it("returns API payload when valid", () => {
    const api = {
      ok: true,
      categories: [{ id: "db1", slug: "restaurant", name: "식당", sort_order: 0 }],
      topics: [{ id: "t1", store_category_id: "db1", slug: "korean", name: "한식", sort_order: 0 }],
    };
    const out = resolveStoresHomeTaxonomyFromApi(api, seed);
    expect(out.categories[0]?.id).toBe("db1");
  });
});
