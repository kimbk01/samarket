import { describe, expect, it, beforeEach } from "vitest";
import {
  beginBrowsePrimaryPendingNav,
  resetBrowsePrimaryPendingNavForTests,
  resolveBrowsePrimaryTabActiveSlug,
  getBrowsePrimaryPendingNavSnapshot,
} from "@/lib/stores/browse-primary-tab-navigation";
import {
  beginBrowseSubPendingNav,
  getBrowseSubPendingNavSnapshot,
  resetBrowseSubPendingNavForTests,
} from "@/lib/stores/browse-sub-chip-navigation";
import {
  getBrowseSubtopicCollapsedSnapshot,
  resetBrowseSubtopicCollapseChromeForSessionExit,
  resetBrowseSubtopicCollapseChromeStateForTests,
} from "@/lib/stores/browse-subtopic-collapse-chrome";
import { storesBrowseAllPath } from "@/components/stores/browse/stores-browse-paths";
import {
  applyStoresCategorySurfaceTransition,
  isNonStoresSurfacePath,
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
const martSubs = [{ id: "t4", slug: "korean-mart", name: "한인마트", store_category_id: "c3", sort_order: 0 }];
const primaries = [
  { id: "c1", slug: "restaurant", name: "식당", sort_order: 0 },
  { id: "c2", slug: "cafe", name: "카페", sort_order: 1 },
  { id: "c3", slug: "mart", name: "마트", sort_order: 2 },
];
const allTopics = [...restaurantSubs, ...cafeSubs, ...martSubs];

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

function expectHomeBaseline() {
  const snap = getStoresHomeCategoryChromeSnapshot();
  expect(snap.pickedSlug).toBeNull();
  expect(snap.activeSlug).toBe(STORES_HOME_BASELINE_PRIMARY);
  expect(deriveHomeSecondaryReveal(snap)).toBe(false);
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
    expect(isNonStoresSurfacePath("/community-messenger")).toBe(true);
    expect(isNonStoresSurfacePath("/mypage")).toBe(true);
    expect(isNonStoresSurfacePath("/market")).toBe(true);
    expect(isNonStoresSurfacePath("/stores")).toBe(false);
    expect(isNonStoresSurfacePath("/stores/browse/cafe")).toBe(false);
    expect(isNonStoresSurfacePath("/stores/aa11")).toBe(false);
  });

  describe("H1 — HOME INITIAL", () => {
    it("baseline active restaurant, picked null, secondary hidden", () => {
      seedHomeTaxonomyReady();
      expectHomeBaseline();
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

  describe("T1 — HOME LEAVE (HOME → NON-STORES → HOME)", () => {
    it("mart selection does not survive non-stores round-trip", () => {
      seedHomeTaxonomyReady();
      selectHomePrimary("mart");
      expect(getStoresHomeCategoryChromeSnapshot().pickedSlug).toBe("mart");

      applyStoresCategorySurfaceTransition("/stores", "/community-messenger");
      expectHomeBaseline();
      expect(getBrowsePrimaryPendingNavSnapshot()).toBeNull();

      applyStoresCategorySurfaceTransition("/community-messenger", "/stores");
      expectHomeBaseline();
    });
  });

  describe("T2 — BROWSE → HOME", () => {
    it("resets HOME baseline and clears browse pending; does not promote browse category", () => {
      seedHomeTaxonomyReady();
      applyStoresCategorySurfaceTransition("/stores", "/stores/browse/restaurant");
      expectHomeBaseline();

      beginBrowsePrimaryPendingNav("restaurant");
      beginBrowseSubPendingNav("restaurant", "korean");
      selectHomePrimary("mart");

      applyStoresCategorySurfaceTransition("/stores/browse/restaurant?sub=korean", "/stores");
      expectHomeBaseline();
      expect(getBrowsePrimaryPendingNavSnapshot()).toBeNull();
      expect(getBrowseSubPendingNavSnapshot()).toBeNull();
    });
  });

  describe("T3 — BROWSE PRIMARY CHANGE", () => {
    it("primary tab destination is always sub=all", () => {
      expect(storesBrowseAllPath("cafe")).toBe("/stores/browse/cafe?sub=all");
      expect(storesBrowseAllPath("restaurant")).toBe("/stores/browse/restaurant?sub=all");
    });
  });

  describe("H5 — HOME → BROWSE", () => {
    it("resets home session on leave to browse", () => {
      seedHomeTaxonomyReady();
      selectHomePrimary("restaurant");
      applyStoresCategorySurfaceTransition("/stores", "/stores/browse/restaurant");
      expectHomeBaseline();
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
