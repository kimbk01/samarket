import { describe, expect, it } from "vitest";
import {
  detectStoresHomeLegacyTaxonomyPaintRegression,
  detectStoresHomeTaxonomyServerSnapshotRegression,
  getStoresHomeTaxonomyServerChromeContract,
} from "@/lib/stores/stores-home-taxonomy-display-contract";
import {
  getStoresHomeCategoryChromeServerSnapshot,
  STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT,
} from "@/lib/stores/stores-home-category-chrome-store";
import {
  resolveStoresHomeTaxonomyFromApi,
  STORES_HOME_TAXONOMY_EMPTY,
} from "@/lib/stores/stores-home-taxonomy-client";
import { getStoresHomeTaxonomySeedState } from "@/lib/stores/stores-home-taxonomy-seed";

describe("stores-home-taxonomy-display-contract", () => {
  it("server chrome starts empty skeleton", () => {
    const snap = getStoresHomeCategoryChromeServerSnapshot();
    expect(snap.taxonomyReady).toBe(false);
    expect(snap.primaries).toHaveLength(0);
    expect(snap.subs).toHaveLength(0);
    expect(getStoresHomeTaxonomyServerChromeContract()).toEqual(STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT);
  });

  it("API parse failure defaults to empty not seed", () => {
    const seed = getStoresHomeTaxonomySeedState();
    const out = resolveStoresHomeTaxonomyFromApi({ ok: false }, STORES_HOME_TAXONOMY_EMPTY);
    expect(out.categories).toHaveLength(0);
    expect(out).not.toEqual(seed);
  });

  it("flags legacy seed/fallback paint", () => {
    expect(
      detectStoresHomeLegacyTaxonomyPaintRegression({
        taxonomyReady: true,
        usedTaxonomySeed: true,
        usedLegacyFallbackIcons: false,
      })
    ).toBe(true);
    expect(
      detectStoresHomeLegacyTaxonomyPaintRegression({
        taxonomyReady: true,
        usedTaxonomySeed: false,
        usedLegacyFallbackIcons: true,
      })
    ).toBe(true);
    expect(
      detectStoresHomeLegacyTaxonomyPaintRegression({
        taxonomyReady: true,
        usedTaxonomySeed: false,
        usedLegacyFallbackIcons: false,
      })
    ).toBe(false);
  });

  it("flags server snapshot ready-with-data without API path", () => {
    expect(
      detectStoresHomeTaxonomyServerSnapshotRegression({
        taxonomyReady: true,
        primaries: [{ id: "x", slug: "restaurant" } as never],
        subs: [],
      })
    ).toBe(true);
    expect(
      detectStoresHomeTaxonomyServerSnapshotRegression({
        taxonomyReady: false,
        primaries: [],
        subs: [],
      })
    ).toBe(false);
  });
});
