import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readStoreMenusPublicServerCache,
  resetStoreMenusPublicServerCacheForTests,
  scheduleStoreMenusRouteMemoryRevalidate,
  storeMenusPreRefreshLeadMs,
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

  it("proactive pre-refresh timer avoids hard stale without user revisit", async () => {
    vi.useFakeTimers();
    const hardTtl = storeMenusRouteMemoryHardTtlMs();
    const leadMs = storeMenusPreRefreshLeadMs();
    let refreshCalls = 0;
    const fetcher = async () => {
      refreshCalls += 1;
      return { body: BODY, snapshotVia: "counter_row" as const };
    };

    writeStoreMenusPublicServerCache("cafe-a", BODY, "counter_row", {
      schedulePreRefreshTimer: fetcher,
    });

    vi.advanceTimersByTime(hardTtl - leadMs + 1);
    await Promise.resolve();
    await Promise.resolve();

    expect(refreshCalls).toBeGreaterThanOrEqual(1);

    vi.advanceTimersByTime(leadMs + 5_000);
    const read = readStoreMenusPublicServerCache("cafe-a");
    expect(read.hit).toBe(true);
    if (!read.hit) expect(read.reason).toBe("hard_stale");
  });

  it("dedupes inflight pre-refresh", async () => {
    let refreshCalls = 0;
    const fetcher = async () => {
      refreshCalls += 1;
      await new Promise((r) => setTimeout(r, 50));
      return { body: BODY, snapshotVia: "counter_row" as const };
    };
    writeStoreMenusPublicServerCache("cafe-a", BODY);
    scheduleStoreMenusRouteMemoryRevalidate("cafe-a", fetcher);
    scheduleStoreMenusRouteMemoryRevalidate("cafe-a", fetcher);
    await new Promise((r) => setTimeout(r, 120));
    expect(refreshCalls).toBe(1);
  });
});
