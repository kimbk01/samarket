import { describe, expect, it, beforeEach } from "vitest";
import {
  beginBrowsePrimaryPendingNav,
  resetBrowsePrimaryPendingNavForTests,
  resolveBrowsePrimaryTabActiveSlug,
} from "@/lib/stores/browse-primary-tab-navigation";
import {
  beginBrowseSubPendingNav,
  resetBrowseSubPendingNavForTests,
} from "@/lib/stores/browse-sub-chip-navigation";
import {
  getBrowseSubtopicCollapsedSnapshot,
  resetBrowseSubtopicCollapseChromeForSessionExit,
  resetBrowseSubtopicCollapseChromeStateForTests,
} from "@/lib/stores/browse-subtopic-collapse-chrome";
import {
  applyStoresCategorySurfaceTransition,
  clearBrowseCategorySession,
  isStoresBrowseSurfacePath,
  isStoresHomeSurfacePath,
} from "@/lib/stores/stores-category-surface-lifecycle";
import {
  deriveHomeSecondaryReveal,
  getStoresHomeCategoryChromeSnapshot,
  patchStoresHomeCategoryChrome,
  resetHomeCategorySession,
  resetStoresHomeCategoryChromeForTests,
  selectHomePrimary,
  STORES_HOME_BASELINE_PRIMARY,
} from "@/lib/stores/stores-home-category-chrome-store";

const restaurantSubs = [
  { id: "t1", slug: "korean", name: "한식", store_category_id: "c1", sort_order: 0 },
  { id: "t2", slug: "chinese", name: "중식", store_category_id: "c1", sort_order: 1 },
];
const cafeSubs = [{ id: "t3", slug: "dessert", name: "디저트", store_category_id: "c2", sort_order: 0 }];
const primaries = [
  { id: "c1", slug: "restaurant", name: "식당", sort_order: 0 },
  { id: "c2", slug: "cafe", name: "카페", sort_order: 1 },
];
const allTopics = [...restaurantSubs, ...cafeSubs];

function seedHomeTaxonomyReady() {
  patchStoresHomeCategoryChrome({
    taxonomyReady: true,
    primaries,
    topics: allTopics,
    subs: restaurantSubs,
    language: "ko",
    primaryAriaLabel: "primary",
  });
}

describe("stores-category-surface-lifecycle", () => {
  beforeEach(() => {
    resetStoresHomeCategoryChromeForTests();
    resetBrowsePrimaryPendingNavForTests();
    resetBrowseSubPendingNavForTests();
    resetBrowseSubtopicCollapseChromeStateForTests();
  });

  it("path helpers", () => {
    expect(isStoresHomeSurfacePath("/stores")).toBe(true);
    expect(isStoresHomeSurfacePath("/stores/")).toBe(true);
    expect(isStoresBrowseSurfacePath("/stores/browse/restaurant")).toBe(true);
    expect(isStoresHomeSurfacePath("/stores/browse/restaurant")).toBe(false);
  });

  describe("H1 — HOME INITIAL", () => {
    it("baseline active restaurant, picked null, secondary hidden", () => {
      seedHomeTaxonomyReady();
      const snap = getStoresHomeCategoryChromeSnapshot();
      expect(snap.activeSlug).toBe(STORES_HOME_BASELINE_PRIMARY);
      expect(snap.pickedSlug).toBeNull();
      expect(deriveHomeSecondaryReveal(snap)).toBe(false);
    });
  });

  describe("H2 — HOME PRIMARY", () => {
    it("tap restaurant reveals secondary without browse nav", () => {
      seedHomeTaxonomyReady();
      selectHomePrimary("restaurant");
      const snap = getStoresHomeCategoryChromeSnapshot();
      expect(snap.pickedSlug).toBe("restaurant");
      expect(snap.activeSlug).toBe("restaurant");
      expect(deriveHomeSecondaryReveal(snap)).toBe(true);
    });
  });

  describe("H3 — CHANGE PRIMARY", () => {
    it("cafe shows cafe subs only — atomic with selectHomePrimary (no split patch)", () => {
      seedHomeTaxonomyReady();
      selectHomePrimary("restaurant");
      selectHomePrimary("cafe");
      const snap = getStoresHomeCategoryChromeSnapshot();
      expect(snap.activeSlug).toBe("cafe");
      expect(snap.pickedSlug).toBe("cafe");
      expect(snap.subs.map((s) => s.slug)).toEqual(["dessert"]);
      expect(deriveHomeSecondaryReveal(snap)).toBe(true);
    });

    it("never leaves activeSlug with previous primary subs", () => {
      seedHomeTaxonomyReady();
      selectHomePrimary("restaurant");
      selectHomePrimary("cafe");
      const snap = getStoresHomeCategoryChromeSnapshot();
      expect(snap.subs.every((s) => s.store_category_id === "c2")).toBe(true);
      expect(snap.subs.some((s) => s.slug === "korean")).toBe(false);
    });
  });

  describe("H5 — BROWSE → HOME", () => {
    it("HOME→BROWSE resets home session; browse exit clears pending", () => {
      seedHomeTaxonomyReady();
      selectHomePrimary("restaurant");
      applyStoresCategorySurfaceTransition("/stores", "/stores/browse/restaurant");
      const homeAfterLeave = getStoresHomeCategoryChromeSnapshot();
      expect(homeAfterLeave.pickedSlug).toBeNull();
      expect(homeAfterLeave.activeSlug).toBe(STORES_HOME_BASELINE_PRIMARY);
      expect(deriveHomeSecondaryReveal(homeAfterLeave)).toBe(false);

      beginBrowsePrimaryPendingNav("restaurant");
      beginBrowseSubPendingNav("restaurant", "korean");
      applyStoresCategorySurfaceTransition("/stores/browse/restaurant", "/stores");
      expect(getStoresHomeCategoryChromeSnapshot().pickedSlug).toBeNull();
    });
  });

  describe("B2 — PRIMARY STALE PREVENTION", () => {
    it("browse exit clears pending primary", () => {
      beginBrowsePrimaryPendingNav("restaurant");
      applyStoresCategorySurfaceTransition("/stores/browse/restaurant", "/stores");
      expect(resolveBrowsePrimaryTabActiveSlug("cafe", null)).toBe("cafe");
    });
  });

  describe("B4 — COLLAPSE RESET", () => {
    it("browse session exit expands primary row baseline", () => {
      resetBrowseSubtopicCollapseChromeStateForTests();
      resetBrowseSubtopicCollapseChromeForSessionExit();
      expect(getBrowseSubtopicCollapsedSnapshot()).toBe(false);
    });
  });
});

describe("resetHomeCategorySession", () => {
  beforeEach(() => {
    resetStoresHomeCategoryChromeForTests();
  });

  it("is idempotent at baseline", () => {
    resetHomeCategorySession();
    selectHomePrimary("cafe");
    resetHomeCategorySession();
    const snap = getStoresHomeCategoryChromeSnapshot();
    expect(snap.pickedSlug).toBeNull();
    expect(snap.activeSlug).toBe(STORES_HOME_BASELINE_PRIMARY);
  });
});
