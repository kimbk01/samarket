import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commitDeliveryStoreNavigationEntry } from "@/lib/navigation/dibay-navigation-context-store";
import { resolveStoreBrowseListHref } from "@/lib/stores/resolve-store-browse-list-href";
import { DIBAY_DELIVERY_ROOT_FALLBACK } from "@/lib/navigation/resolve-dibay-back-target";

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
}

describe("resolveStoreBrowseListHref (CUT 2)", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns full originHref including sort", () => {
    commitDeliveryStoreNavigationEntry({
      storeSlug: "aa11",
      pathname: "/stores/browse/restaurant",
      search: "?sub=korean&sort=popular",
      productId: null,
    });
    expect(
      resolveStoreBrowseListHref({
        storeSlug: "aa11",
        storeCategorySlug: "mart",
        businessType: "식당 · 한식",
      })
    ).toBe("/stores/browse/restaurant?sub=korean&sort=popular");
  });

  it("does not invent browse from DB category when no origin", () => {
    expect(
      resolveStoreBrowseListHref({
        storeSlug: "aa11",
        storeCategorySlug: "mart",
        businessType: "식당 · 한식",
      })
    ).toBe(DIBAY_DELIVERY_ROOT_FALLBACK);
  });

  it("HOME origin is /stores", () => {
    commitDeliveryStoreNavigationEntry({
      storeSlug: "x",
      pathname: "/stores",
      search: "",
      productId: null,
    });
    expect(resolveStoreBrowseListHref({ storeSlug: "x" })).toBe("/stores");
  });

  it("defaults to /stores when unknown slug empty", () => {
    expect(resolveStoreBrowseListHref({ storeSlug: "" })).toBe(DIBAY_DELIVERY_ROOT_FALLBACK);
  });
});
