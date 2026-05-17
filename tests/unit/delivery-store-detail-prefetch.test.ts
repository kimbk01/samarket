import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const PREFETCH_MIN_GAP_MS = 2_000;

const { perfTraceLog } = vi.hoisted(() => ({
  perfTraceLog: vi.fn(),
}));

vi.mock("@/lib/dibay/delivery-perf-trace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dibay/delivery-perf-trace")>();
  return {
    ...actual,
    deliveryPerfTraceEnabled: () => true,
    deliveryPerfTraceLog: perfTraceLog,
  };
});

vi.mock("@/lib/dibay/delivery-store-summary-prewarm", () => ({
  deliveryStoreSummaryPrewarmMaybe: vi.fn(),
  deliveryStoreSummaryPrewarmIsArmed: () => false,
}));

import {
  buildStoreDetailHref,
  deliveryStoreDetailPrefetch,
  deliveryStoreDetailPrefetchCheckBeforeTap,
  deliveryStoreDetailPrefetchForTap,
  deliveryStoreDetailScheduleTapPush,
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
    perfTraceLog.mockClear();
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

  it("prefetches focusProduct href separately from base slug path", async () => {
    const router = { prefetch: vi.fn().mockResolvedValue(undefined) };
    const baseHref = "/stores/aa11";
    const focusHref = buildStoreDetailHref("aa11", "prod-1");

    deliveryStoreDetailPrefetch(router, "aa11", "viewport");
    await flushPrefetchWork();
    vi.runAllTimers();
    await flushPrefetchWork();

    expect(router.prefetch).toHaveBeenCalledWith(baseHref);

    deliveryStoreDetailPrefetch(router, "aa11", "pointer_down", {
      force: true,
      focusProductId: "prod-1",
    });
    await flushPrefetchWork();
    vi.runAllTimers();
    await flushPrefetchWork();

    expect(router.prefetch).toHaveBeenCalledWith(focusHref);
    const ready = deliveryStoreDetailPrefetchCheckBeforeTap(focusHref);
    expect(ready.was_prefetch_ready).toBe(true);
    expect(ready.hit).toBe(true);

    const beforeTap = perfTraceLog.mock.calls.find(
      (c) => c[0] === "[delivery-prefetch-before-tap]"
    );
    expect(beforeTap?.[1]).toMatchObject({
      prefetch_key: focusHref,
      prefetch_hit: true,
      has_focus_product: true,
      reason: "ready",
    });
  });

  it("prefetchForTap schedules card_click on exact href before tap state read", async () => {
    const router = { prefetch: vi.fn().mockResolvedValue(undefined) };
    const focusHref = buildStoreDetailHref("aa11", "prod-2");

    const tap = deliveryStoreDetailPrefetchForTap(router, "aa11", focusHref);
    expect(router.prefetch).toHaveBeenCalledWith(focusHref);
    expect(tap.was_prefetched_request || tap.was_prefetch_inflight).toBe(true);

    await flushPrefetchWork();
    vi.runAllTimers();
    await flushPrefetchWork();

    const ready = deliveryStoreDetailPrefetchCheckBeforeTap(focusHref);
    expect(ready.was_prefetch_ready).toBe(true);
    expect(ready.hit).toBe(true);
  });

  it("prefetchForTap prefetches focused href before optional base href", async () => {
    const router = { prefetch: vi.fn().mockResolvedValue(undefined) };
    const focusHref = buildStoreDetailHref("aa11", "prod-3");
    const baseHref = "/stores/aa11";

    deliveryStoreDetailPrefetchForTap(router, "aa11", focusHref);

    expect(router.prefetch.mock.calls[0]?.[0]).toBe(focusHref);
    const prefetchedHrefs = router.prefetch.mock.calls.map((c) => c[0]);
    expect(prefetchedHrefs).toContain(focusHref);
    if (prefetchedHrefs.length > 1) {
      expect(prefetchedHrefs).toContain(baseHref);
    }
  });

  it("releases stuck inflight flight after cap without marking ready", async () => {
    let resolvePrefetch!: () => void;
    const router = {
      prefetch: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolvePrefetch = resolve;
          })
      ),
    };
    const focusHref = buildStoreDetailHref("aa11", "stuck-prod");

    deliveryStoreDetailPrefetch(router, "aa11", "pointer_down", {
      force: true,
      focusProductId: "stuck-prod",
    });
    expect(
      deliveryStoreDetailPrefetchCheckBeforeTap(focusHref, { logBeforeTap: false })
        .was_prefetch_inflight
    ).toBe(true);

    await vi.advanceTimersByTimeAsync(5_001);
    const tap = deliveryStoreDetailPrefetchCheckBeforeTap(focusHref, {
      logBeforeTap: false,
    });
    expect(tap.was_prefetch_inflight).toBe(false);
    expect(tap.was_prefetch_ready).toBe(false);

    resolvePrefetch();
    await flushPrefetchWork();
  });

  it("scheduleTapPush defers push until inflight prefetch promise settles", async () => {
    let resolvePrefetch!: () => void;
    const router = {
      prefetch: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolvePrefetch = resolve;
          })
      ),
    };
    const focusHref = buildStoreDetailHref("aa11", "prod-wait");

    deliveryStoreDetailPrefetch(router, "aa11", "pointer_down", {
      force: true,
      focusProductId: "prod-wait",
    });
    const tap = deliveryStoreDetailPrefetchCheckBeforeTap(focusHref, {
      logBeforeTap: false,
    });
    expect(tap.was_prefetch_inflight).toBe(true);

    const pushFn = vi.fn();
    deliveryStoreDetailScheduleTapPush(focusHref, tap, pushFn);
    expect(pushFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(pushFn).not.toHaveBeenCalled();

    resolvePrefetch();
    await flushPrefetchWork();
    vi.runAllTimers();
    await flushPrefetchWork();

    expect(pushFn).toHaveBeenCalledTimes(1);
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
