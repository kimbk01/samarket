import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const PREFETCH_MIN_GAP_MS = 2_000;

vi.mock("@/lib/dibay/delivery-perf-trace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dibay/delivery-perf-trace")>();
  return {
    ...actual,
    deliveryPerfTraceEnabled: () => true,
    deliveryPerfTraceLog: vi.fn(),
  };
});

vi.mock("@/lib/dibay/delivery-store-summary-prewarm", () => ({
  deliveryStoreSummaryPrewarmMaybe: vi.fn(),
  deliveryStoreSummaryPrewarmIsArmed: () => false,
}));

import {
  deliveryStoreDetailPrefetch,
  deliveryStoreDetailPrefetchCheckBeforeTap,
  resetDeliveryStoreDetailPrefetchForTests,
} from "@/lib/dibay/delivery-store-detail-prefetch";
import {
  DELIVERY_STORE_DETAIL_PREFETCH_TTL_MS,
  resetDeliveryStorePrefetchTraceForTests,
} from "@/lib/dibay/delivery-store-prefetch-trace";

function mockSessionStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    key: () => null,
    length: store.size,
    clear: () => store.clear(),
  });
  return store;
}

async function flushPrefetchWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("delivery-store-detail-prefetch", () => {
  beforeEach(() => {
    mockSessionStorage();
    resetDeliveryStoreDetailPrefetchForTests();
    resetDeliveryStorePrefetchTraceForTests();
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(0), 0) as unknown as number;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("dedupes rapid requests via min_gap", async () => {
    const router = { prefetch: vi.fn().mockResolvedValue(undefined) };
    const href = "/stores/aa11";

    expect(deliveryStoreDetailPrefetch(router, "aa11", "viewport")).toBe(true);
    expect(deliveryStoreDetailPrefetch(router, "aa11", "viewport")).toBe(false);

    await flushPrefetchWork();
    vi.runAllTimers();
    await flushPrefetchWork();
    expect(router.prefetch).toHaveBeenCalledTimes(1);
    expect(router.prefetch).toHaveBeenCalledWith(href);
  });

  it("marks tap ready only after prefetch promise settles", async () => {
    const router = { prefetch: vi.fn().mockResolvedValue(undefined) };
    const href = "/stores/aa11";

    deliveryStoreDetailPrefetch(router, "aa11", "viewport");
    let inflight = deliveryStoreDetailPrefetchCheckBeforeTap(href);
    expect(inflight.was_prefetch_inflight).toBe(true);
    expect(inflight.was_prefetch_ready).toBe(false);

    await flushPrefetchWork();
    vi.runAllTimers();
    await flushPrefetchWork();

    vi.advanceTimersByTime(200);
    const ready = deliveryStoreDetailPrefetchCheckBeforeTap(href);
    expect(ready.was_prefetch_ready).toBe(true);
    expect(ready.was_prefetch_inflight).toBe(false);
    expect(ready.prefetch_ready_age_ms).toBeGreaterThanOrEqual(0);
    expect(ready.prefetch_ready_age_ms).toBeLessThan(DELIVERY_STORE_DETAIL_PREFETCH_TTL_MS);
  });

  it("force bypasses min_gap after prior prefetch finished", async () => {
    const router = { prefetch: vi.fn().mockResolvedValue(undefined) };

    deliveryStoreDetailPrefetch(router, "aa11", "viewport");
    await flushPrefetchWork();
    vi.runAllTimers();
    await flushPrefetchWork();

    vi.advanceTimersByTime(PREFETCH_MIN_GAP_MS + 1);
    expect(deliveryStoreDetailPrefetch(router, "aa11", "pointer_down", { force: true })).toBe(
      true
    );

    await flushPrefetchWork();
    vi.runAllTimers();
    await flushPrefetchWork();
    expect(router.prefetch).toHaveBeenCalledTimes(2);
  });
});
