import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import {
  invalidateStoresBrowseSessionCache,
  peekStoresBrowseSessionCache,
  writeStoresBrowseSessionCache,
} from "@/lib/stores/stores-browse-client-session-cache";

const sampleRow = {
  id: "s1",
  slug: "sample-store",
  name: "Sample",
  rating: 4.5,
  reviewCount: 10,
  deliveryAvailable: true,
  etaLabel: "20 min",
  estPrepLabel: "20 min",
} as unknown as BrowseStoreListItem;

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
  vi.stubGlobal("window", {
    sessionStorage,
    location: { pathname: "/stores/browse/pet", search: "?sub=all" },
  });
  vi.stubGlobal("sessionStorage", sessionStorage);
  return store;
}

describe("stores-browse-client-session-cache", () => {
  beforeEach(() => {
    stubSessionStorage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("write then peek returns rows and discovery shelf within TTL", () => {
    writeStoresBrowseSessionCache("primary=pet&sub=all", "en", {
      rows: [sampleRow],
      source: "supabase",
      discoveryShelf: {
        enabled: true,
        position: "page_top",
        afterN: 2,
        everyN: 2,
        maxShelvesPerPage: 1,
        dataType: "recommended",
        stores: [{ storeId: "shelf-1", slug: "shelf-1", name: "Shelf", imageUrl: null, etaLabel: null, rating: 5 }],
      },
    });
    const hit = peekStoresBrowseSessionCache("primary=pet&sub=all", "en");
    expect(hit?.rows).toHaveLength(1);
    expect(hit?.source).toBe("supabase");
    expect(hit?.discoveryShelf?.stores[0]?.storeId).toBe("shelf-1");
  });

  it("invalidate clears qs cache", () => {
    writeStoresBrowseSessionCache("primary=pet&sub=all", "en", {
      rows: [sampleRow],
      source: "supabase",
    });
    invalidateStoresBrowseSessionCache("primary=pet&sub=all", "en");
    expect(peekStoresBrowseSessionCache("primary=pet&sub=all", "en")).toBeNull();
  });

  it("expires after TTL", () => {
    writeStoresBrowseSessionCache("primary=pet&sub=all", "en", {
      rows: [sampleRow],
      source: "supabase",
    });
    vi.advanceTimersByTime(46_000);
    expect(peekStoresBrowseSessionCache("primary=pet&sub=all", "en")).toBeNull();
  });
});
