import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readStoreMenusPublicServerCache,
  resetStoreMenusPublicServerCacheForTests,
  scheduleStoreMenusRouteMemoryRevalidate,
  storeMenusRouteMemoryHardTtlMs,
  storeMenusRouteMemorySoftTtlMs,
  writeStoreMenusPublicServerCache,
} from "@/lib/stores/store-menus-public-server-cache";

const BODY = { ok: true, store: { id: "s1" }, products: [] };

describe("store-menus-public-server-cache SWR", () => {
  afterEach(() => {
    resetStoreMenusPublicServerCacheForTests();
    vi.useRealTimers();
  });

  it("returns fresh hit within soft TTL", () => {
    vi.useFakeTimers();
    writeStoreMenusPublicServerCache("cafe-a", BODY, "counter_row");
    vi.advanceTimersByTime(storeMenusRouteMemorySoftTtlMs() - 1);
    const read = readStoreMenusPublicServerCache("cafe-a");
    expect(read.hit).toBe(true);
    if (read.hit) {
      expect(read.stale).toBe(false);
      expect(read.snapshotVia).toBe("counter_row");
    }
  });

  it("returns soft stale hit between soft and hard TTL", () => {
    vi.useFakeTimers();
    writeStoreMenusPublicServerCache("cafe-a", BODY, "unified_rpc");
    vi.advanceTimersByTime(storeMenusRouteMemorySoftTtlMs() + 1);
    const read = readStoreMenusPublicServerCache("cafe-a");
    expect(read.hit).toBe(true);
    if (read.hit) {
      expect(read.stale).toBe(true);
    }
  });

  it("hard stale miss after hard TTL", () => {
    vi.useFakeTimers();
    writeStoreMenusPublicServerCache("cafe-a", BODY);
    vi.advanceTimersByTime(storeMenusRouteMemoryHardTtlMs() + 1);
    const read = readStoreMenusPublicServerCache("cafe-a");
    expect(read.hit).toBe(false);
    if (!read.hit) expect(read.reason).toBe("hard_stale");
  });

  it("background refresh updates memory cache", async () => {
    writeStoreMenusPublicServerCache("cafe-a", BODY);
    const refreshed = { ok: true, store: { id: "s2" }, products: [{ id: "p1" }] };
    scheduleStoreMenusRouteMemoryRevalidate("cafe-a", async () => ({
      body: refreshed,
      snapshotVia: "counter_row" as const,
    }));
    await vi.waitFor(() => {
      const read = readStoreMenusPublicServerCache("cafe-a");
      expect(read.hit).toBe(true);
      if (read.hit) expect(read.body).toEqual(refreshed);
    });
  });
});
