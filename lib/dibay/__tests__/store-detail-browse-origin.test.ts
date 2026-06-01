import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseBrowseSubSlugFromSearch,
  readStoreDetailBrowseOrigin,
  writeStoreDetailBrowseOrigin,
} from "@/lib/dibay/store-detail-browse-origin";

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
});
