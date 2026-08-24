import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoreDetailBrowseOrigin,
  commitStoreDetailBrowseOriginForEntry,
  parseBrowseSubSlugFromSearch,
  readStoreDetailBrowseOrigin,
  writeStoreDetailBrowseOrigin,
} from "@/lib/dibay/store-detail-browse-origin";
import { resolveStoreBrowseListHref } from "@/lib/stores/resolve-store-browse-list-href";

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

describe("store-detail-browse-origin", () => {
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

  it("write and read primary + sub", () => {
    writeStoreDetailBrowseOrigin("my-store", "restaurant", "korean");
    expect(readStoreDetailBrowseOrigin("my-store")).toEqual({
      primarySlug: "restaurant",
      subSlug: "korean",
    });
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
        "?sub=korean",
      );
      expect(readStoreDetailBrowseOrigin("store-a")).toEqual({
        primarySlug: "restaurant",
        subSlug: "korean",
      });
      expect(
        resolveStoreBrowseListHref({
          storeSlug: "store-a",
          storeCategorySlug: "mart",
        }),
      ).toBe("/stores/browse/restaurant?sub=korean");

      commitStoreDetailBrowseOriginForEntry(
        "store-a",
        "/stores/browse/cafe",
        "?sub=dessert",
      );
      expect(readStoreDetailBrowseOrigin("store-a")).toEqual({
        primarySlug: "cafe",
        subSlug: "dessert",
      });
      expect(
        resolveStoreBrowseListHref({
          storeSlug: "store-a",
          storeCategorySlug: "mart",
        }),
      ).toBe("/stores/browse/cafe?sub=dessert");
    });
  });

  describe("T5 — DIFFERENT STORES", () => {
    it("each store keeps its own latest entry origin", () => {
      commitStoreDetailBrowseOriginForEntry(
        "store-x",
        "/stores/browse/restaurant",
        "?sub=korean",
      );
      commitStoreDetailBrowseOriginForEntry(
        "store-y",
        "/stores/browse/cafe",
        "?sub=dessert",
      );
      expect(
        resolveStoreBrowseListHref({ storeSlug: "store-x", storeCategorySlug: "mart" }),
      ).toBe("/stores/browse/restaurant?sub=korean");
      expect(
        resolveStoreBrowseListHref({ storeSlug: "store-y", storeCategorySlug: "mart" }),
      ).toBe("/stores/browse/cafe?sub=dessert");
    });
  });

  describe("T6 — TTL does not block overwrite", () => {
    it("overwrites within TTL window", () => {
      const now = 1_000_000;
      vi.spyOn(Date, "now").mockReturnValue(now);
      writeStoreDetailBrowseOrigin("store-a", "restaurant", "korean");

      vi.spyOn(Date, "now").mockReturnValue(now + 10_000);
      commitStoreDetailBrowseOriginForEntry(
        "store-a",
        "/stores/browse/cafe",
        "?sub=dessert",
      );
      expect(readStoreDetailBrowseOrigin("store-a")).toEqual({
        primarySlug: "cafe",
        subSlug: "dessert",
      });
    });
  });

  it("non-browse entry clears stale origin", () => {
    writeStoreDetailBrowseOrigin("store-a", "restaurant", "korean");
    commitStoreDetailBrowseOriginForEntry("store-a", "/stores", "");
    expect(readStoreDetailBrowseOrigin("store-a")).toBeNull();
    clearStoreDetailBrowseOrigin("store-a");
  });
});
