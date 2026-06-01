import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeStoreDetailBrowseOrigin } from "@/lib/dibay/store-detail-browse-origin";
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
}

describe("resolveStoreBrowseListHref", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores saved browse sub from session", () => {
    writeStoreDetailBrowseOrigin("aa11", "restaurant", "korean");
    expect(
      resolveStoreBrowseListHref({
        storeSlug: "aa11",
        storeCategorySlug: "mart",
        businessType: "식당 · 한식",
      }),
    ).toBe("/stores/browse/restaurant?sub=korean");
  });

  it("uses store category slug when present", () => {
    expect(
      resolveStoreBrowseListHref({
        storeSlug: "aa11",
        storeCategorySlug: "mart",
        businessType: "식당 · 한식",
      })
    ).toBe("/stores/browse/mart?sub=all");
  });

  it("parses business_type primary display name", () => {
    expect(
      resolveStoreBrowseListHref({
        storeSlug: "x",
        businessType: "공구류 · 전동공구",
      })
    ).toBe("/stores/browse/hardware?sub=all");
  });

  it("defaults to restaurant when unknown", () => {
    expect(resolveStoreBrowseListHref({ storeSlug: "x" })).toBe(
      "/stores/browse/restaurant?sub=all"
    );
  });
});
