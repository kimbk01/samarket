/**
 * CUT 1 — taxonomy SSOT contract tests (HOME/BROWSE shared resolver).
 */

import { describe, expect, it } from "vitest";
import {
  compareStoreTaxonomySortOrder,
  resolveCanonicalPrimaryBySlug,
  resolveCanonicalPrimaryIndustries,
  resolveCanonicalSecondaryIndustries,
  resolveTaxonomyIndustryLabel,
  sortTaxonomyCategories,
} from "@/lib/stores/store-taxonomy-canonical";
import {
  listBrowseSubIndustriesForPrimary,
  mergeBrowsePrimaryIndustries,
  parseBrowseTaxonomyPayload,
  resolveBrowsePrimaryEntryHref,
} from "@/lib/stores/browse-taxonomy-resolvers";
import { BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER } from "@/lib/stores/browse-primary-industry-display";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TAXONOMY = parseBrowseTaxonomyPayload({
  ok: true,
  categories: [
    { id: "c-mart", name: "마트", name_en: "Mart", slug: "mart", sort_order: 10, image_url: null },
    { id: "c-rest", name: "식당", name_en: "Restaurant", slug: "restaurant", sort_order: 0, image_url: null },
    { id: "c-extra", name: "추가업종", name_en: "Extra", slug: "extra_biz", sort_order: 5, image_url: null },
  ],
  topics: [
    {
      id: "t-cn",
      store_category_id: "c-rest",
      name: "중식",
      name_en: "Chinese",
      slug: "chinese",
      sort_order: 10,
    },
    {
      id: "t-kr",
      store_category_id: "c-rest",
      name: "한식",
      name_en: "Korean",
      slug: "korean",
      sort_order: 0,
    },
    {
      id: "t-meat",
      store_category_id: "c-mart",
      name: "정육",
      name_en: "Meat",
      slug: "meat",
      sort_order: 0,
    },
  ],
});

describe("CUT 1 store taxonomy canonical SSOT", () => {
  it("T1 primary order = sort_order ASC then slug (not restaurant-first hardcode)", () => {
    const primaries = resolveCanonicalPrimaryIndustries(TAXONOMY);
    expect(primaries.map((p) => p.slug)).toEqual(["restaurant", "extra_biz", "mart"]);
    expect(compareStoreTaxonomySortOrder({ slug: "a", sort_order: 1 }, { slug: "b", sort_order: 1 })).toBeLessThan(
      0
    );
  });

  it("T2/T3 HOME and BROWSE primary consumers share same set/order", () => {
    const viaCanonical = resolveCanonicalPrimaryIndustries(TAXONOMY).map((p) => p.slug);
    const viaBrowseAlias = mergeBrowsePrimaryIndustries(TAXONOMY).map((p) => p.slug);
    const viaHomeSort = sortTaxonomyCategories(TAXONOMY!.categories).map((c) => c.slug);
    expect(viaCanonical).toEqual(viaBrowseAlias);
    expect(viaCanonical).toEqual(viaHomeSort);
  });

  it("T4 secondary = same parent + sort_order", () => {
    const a = resolveCanonicalSecondaryIndustries(TAXONOMY, "restaurant").map((s) => s.slug);
    const b = listBrowseSubIndustriesForPrimary(TAXONOMY, "restaurant").map((s) => s.slug);
    expect(a).toEqual(["korean", "chinese"]);
    expect(a).toEqual(b);
    expect(resolveCanonicalSecondaryIndustries(TAXONOMY, "mart").map((s) => s.slug)).toEqual(["meat"]);
  });

  it("T5 browse display title = taxonomy name only", () => {
    const p = resolveCanonicalPrimaryBySlug(TAXONOMY, "restaurant");
    expect(p?.nameKo).toBe("식당");
    expect(resolveTaxonomyIndustryLabel("ko", p!.nameKo, p!.name_en, p!.slug)).toBe("식당");
    expect(resolveTaxonomyIndustryLabel("en", p!.nameKo, p!.name_en, p!.slug)).toBe("Restaurant");
    // must not invent i18n catalog override when taxonomy en is present
    expect(resolveTaxonomyIndustryLabel("en", "식당", "Restaurant", "restaurant")).toBe("Restaurant");
  });

  it("T6 fixed 8-slug is not runtime authority for ordering/membership", () => {
    const primaries = resolveCanonicalPrimaryIndustries(TAXONOMY);
    expect(primaries.map((p) => p.slug)).toContain("extra_biz");
    expect(primaries.map((p) => p.slug)).not.toEqual([...BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER]);
    // null taxonomy → empty, not seed 8
    expect(mergeBrowsePrimaryIndustries(null)).toEqual([]);
    expect(listBrowseSubIndustriesForPrimary(null, "restaurant")).toEqual([]);
  });

  it("T7 mock/seed production merge absent in resolver module", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/browse-taxonomy-resolvers.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/listBrowsePrimaryIndustries/);
    expect(src).not.toMatch(/browse-taxonomy-seed-queries/);
    expect(src).not.toMatch(/BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER/);
    const home = readFileSync(
      join(process.cwd(), "components/stores/home/hub/StoresHomeQuickCategories.tsx"),
      "utf8"
    );
    expect(home).not.toMatch(/sortPrimariesRestaurantFirst/);
    expect(home).not.toMatch(/restaurant-first|RESTAURANT_SLUG.*unshift/i);
    const browseView = readFileSync(
      join(process.cwd(), "components/stores/browse/StoresBrowsePrimaryView.tsx"),
      "utf8"
    );
    expect(browseView).not.toMatch(/displayTitleKo\?\.trim\(\)/);
    expect(browseView).toMatch(/resolveTaxonomyIndustryLabel/);
  });

  it("parse + entry href unchanged", () => {
    expect(parseBrowseTaxonomyPayload({ ok: false })).toBeNull();
    expect(parseBrowseTaxonomyPayload({ ok: true, categories: [] })).toBeNull();
    expect(resolveBrowsePrimaryEntryHref("restaurant").path).toBe(
      "/stores/browse/restaurant?sub=all"
    );
  });
});
