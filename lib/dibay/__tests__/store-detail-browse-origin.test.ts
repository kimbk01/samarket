import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoreDetailBrowseOrigin,
  commitStoreDetailBrowseOriginForEntry,
  parseBrowseSubSlugFromSearch,
  readStoreDetailBrowseOrigin,
  writeStoreDetailBrowseOrigin,
} from "@/lib/dibay/store-detail-browse-origin";
import { resolveStoreBrowseListHref } from "@/lib/stores/resolve-store-browse-list-href";
import { readNavigationEntryContext } from "@/lib/navigation/dibay-navigation-context-store";

function stubSessionStorage() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal("sessionStorage", sessionStorage);
  return store;
}

describe("store-detail-browse-origin (CUT 2 adapted)", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parseBrowseSubSlugFromSearch", () => {
    expect(parseBrowseSubSlugFromSearch("?sub=korean")).toBe("korean");
    expect(parseBrowseSubSlugFromSearch("?sub=all")).toBe("all");
    expect(parseBrowseSubSlugFromSearch("")).toBe("all");
  });

  it("write and read primary + sub via full originHref", () => {
    writeStoreDetailBrowseOrigin("my-store", "restaurant", "korean");
    expect(readStoreDetailBrowseOrigin("my-store")).toEqual({
      primarySlug: "restaurant",
      subSlug: "korean",
    });
    expect(readNavigationEntryContext("my-store")?.originHref).toBe(
      "/stores/browse/restaurant?sub=korean"
    );
  });

  it("defaults sub to all when omitted", () => {
    writeStoreDetailBrowseOrigin("x", "mart");
    expect(readStoreDetailBrowseOrigin("x")).toEqual({
      primarySlug: "mart",
      subSlug: "all",
    });
  });

  describe("T4 — SAME STORE / DIFFERENT ORIGIN (LATEST ENTRY WINS)", () => {
    it("second browse entry overwrites first for same store", () => {
      commitStoreDetailBrowseOriginForEntry(
        "store-a",
        "/stores/browse/restaurant",
        "?sub=korean"
      );
      expect(readStoreDetailBrowseOrigin("store-a")).toEqual({
        primarySlug: "restaurant",
        subSlug: "korean",
      });
      expect(
        resolveStoreBrowseListHref({
          storeSlug: "store-a",
          storeCategorySlug: "mart",
        })
      ).toBe("/stores/browse/restaurant?sub=korean");

      commitStoreDetailBrowseOriginForEntry(
        "store-a",
        "/stores/browse/cafe",
        "?sub=dessert&sort=popular"
      );
      expect(readNavigationEntryContext("store-a")?.originHref).toBe(
        "/stores/browse/cafe?sub=dessert&sort=popular"
      );
      expect(
        resolveStoreBrowseListHref({
          storeSlug: "store-a",
          storeCategorySlug: "mart",
        })
      ).toBe("/stores/browse/cafe?sub=dessert&sort=popular");
    });
  });

  describe("T5 — DIFFERENT STORES", () => {
    it("each store keeps its own latest entry origin", () => {
      commitStoreDetailBrowseOriginForEntry(
        "store-x",
        "/stores/browse/restaurant",
        "?sub=korean"
      );
      commitStoreDetailBrowseOriginForEntry(
        "store-y",
        "/stores/browse/cafe",
        "?sub=dessert"
      );
      expect(
        resolveStoreBrowseListHref({ storeSlug: "store-x", storeCategorySlug: "mart" })
      ).toBe("/stores/browse/restaurant?sub=korean");
      expect(
        resolveStoreBrowseListHref({ storeSlug: "store-y", storeCategorySlug: "mart" })
      ).toBe("/stores/browse/cafe?sub=dessert");
    });
  });

  describe("HOME entry preserved (CUT 2 — no clear)", () => {
    it("HOME commit keeps /stores origin (does not clear)", () => {
      writeStoreDetailBrowseOrigin("store-a", "restaurant", "korean");
      commitStoreDetailBrowseOriginForEntry("store-a", "/stores", "");
      expect(readNavigationEntryContext("store-a")?.originHref).toBe("/stores");
      expect(resolveStoreBrowseListHref({ storeSlug: "store-a" })).toBe("/stores");
      clearStoreDetailBrowseOrigin("store-a");
    });
  });
});
