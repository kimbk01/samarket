import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextCache = vi.hoisted(() => ({
  generation: "g1" as string,
  reads: 0,
  fail: false,
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (_cb: () => Promise<string>) => async () => {
    nextCache.reads += 1;
    if (nextCache.fail) throw new Error("Invariant: incrementalCache missing");
    return nextCache.generation;
  },
  revalidateTag: nextCache.revalidateTag,
}));

import {
  bumpStorePublicSharedCacheGeneration,
  resetStorePublicSharedCacheGenerationForTests,
  STORE_PUBLIC_SHARED_CACHE_SYNC_WINDOW_MS,
  STORE_PUBLIC_SHARED_CACHE_TAG,
  syncStorePublicReadCachesWithSharedGeneration,
} from "@/lib/stores/store-public-shared-cache-generation";
import {
  getStoreHomeFeedCache,
  setStoreHomeFeedCache,
} from "@/lib/stores/store-home-feed-server-cache";
import {
  readStoreSummaryPublicServerCache,
  writeStoreSummaryPublicServerCache,
} from "@/lib/stores/store-summary-public-server-cache";
import {
  readStoreMenusPublicServerCache,
  writeStoreMenusPublicServerCache,
  resetStoreMenusPublicServerCacheForTests,
} from "@/lib/stores/store-menus-public-server-cache";
import { peekStoresBrowseCache, setStoresBrowseCache } from "@/lib/stores/stores-browse-response-cache";

function fillLocalCaches(): void {
  setStoreHomeFeedCache("k", { ok: true, stores: [], meta: { source: "supabase", sorted_by: "x" } });
  writeStoreSummaryPublicServerCache("aa11", { ok: true });
  writeStoreMenusPublicServerCache("aa11", { ok: true });
  setStoresBrowseCache("food\0all", { ok: true, stores: [] });
}

function localCachesFilled(): boolean[] {
  return [
    getStoreHomeFeedCache("k") != null,
    readStoreSummaryPublicServerCache("aa11") != null,
    readStoreMenusPublicServerCache("aa11").hit,
    peekStoresBrowseCache("food\0all") != null,
  ];
}

describe("DEF-64 store public shared cache generation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
    nextCache.generation = "g1";
    nextCache.reads = 0;
    nextCache.fail = false;
    nextCache.revalidateTag.mockReset();
    resetStorePublicSharedCacheGenerationForTests();
    resetStoreMenusPublicServerCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the shared generation at most once per sync window (hot path = memory compare)", async () => {
    await syncStorePublicReadCachesWithSharedGeneration();
    expect(nextCache.reads).toBe(1);
    fillLocalCaches();

    for (let i = 0; i < 50; i += 1) {
      await syncStorePublicReadCachesWithSharedGeneration();
    }
    expect(nextCache.reads).toBe(1);
    expect(localCachesFilled()).toEqual([true, true, true, true]);
  });

  it("concurrent requests share one in-flight generation read", async () => {
    await Promise.all([
      syncStorePublicReadCachesWithSharedGeneration(),
      syncStorePublicReadCachesWithSharedGeneration(),
      syncStorePublicReadCachesWithSharedGeneration(),
    ]);
    expect(nextCache.reads).toBe(1);
  });

  it("purges every local memory cache when another instance bumped the generation", async () => {
    await syncStorePublicReadCachesWithSharedGeneration();
    fillLocalCaches();

    // unchanged generation after window → keep caches
    vi.advanceTimersByTime(STORE_PUBLIC_SHARED_CACHE_SYNC_WINDOW_MS + 1);
    await syncStorePublicReadCachesWithSharedGeneration();
    expect(localCachesFilled()).toEqual([true, true, true, true]);

    // admin write on another instance → tag expired → new token
    nextCache.generation = "g2";
    vi.advanceTimersByTime(STORE_PUBLIC_SHARED_CACHE_SYNC_WINDOW_MS + 1);
    await syncStorePublicReadCachesWithSharedGeneration();
    expect(localCachesFilled()).toEqual([false, false, false, false]);
  });

  it("bump purges locally and expires the shared tag immediately", () => {
    fillLocalCaches();
    bumpStorePublicSharedCacheGeneration("admin_store.set_store_visible");
    expect(localCachesFilled()).toEqual([false, false, false, false]);
    expect(nextCache.revalidateTag).toHaveBeenCalledWith(STORE_PUBLIC_SHARED_CACHE_TAG, { expire: 0 });
  });

  it("never rejects and never purges repeatedly when the data cache is unavailable", async () => {
    await syncStorePublicReadCachesWithSharedGeneration();
    fillLocalCaches();
    nextCache.fail = true;
    vi.advanceTimersByTime(STORE_PUBLIC_SHARED_CACHE_SYNC_WINDOW_MS + 1);
    await expect(syncStorePublicReadCachesWithSharedGeneration()).resolves.toBeUndefined();
    expect(localCachesFilled()).toEqual([true, true, true, true]);
  });

  it("bump is best-effort when revalidateTag throws (outside request scope)", () => {
    nextCache.revalidateTag.mockImplementation(() => {
      throw new Error("Invariant: static generation store missing");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => bumpStorePublicSharedCacheGeneration("test")).not.toThrow();
    warn.mockRestore();
  });
});
