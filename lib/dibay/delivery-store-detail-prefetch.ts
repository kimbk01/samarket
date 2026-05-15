"use client";

/**
 * 배달 매장 상세 `/stores/[slug]` route prefetch — ready/in-flight/miss·tap push 스케줄.
 */

import {
  deliveryStorePrefetchMarkComplete,
  deliveryStorePrefetchMarkRequest,
  deliveryStorePrefetchMarkSingleFlight,
  deliveryStorePrefetchMarkSkipped,
  deliveryStorePrefetchReadDurationMs,
  deliveryStorePrefetchReadReadyAt,
  deliveryStorePrefetchReadRequestAt,
  deliveryStorePrefetchResolveTapState,
  type DeliveryStorePrefetchTapState,
} from "@/lib/dibay/delivery-store-prefetch-trace";
import { deliveryStoreSummaryPrewarmMaybe } from "@/lib/dibay/delivery-store-summary-prewarm";

const PREFETCH_MIN_GAP_MS = 2_000;
const MAX_ACTIVE_PREFETCH = 4;
const TAP_PUSH_MAX_WAIT_MS = 50;

export type DeliveryStoreDetailPrefetchSource =
  | "viewport"
  | "pointer_enter"
  | "focus"
  | "pointer_down"
  | "touch_start"
  | "card_click";

type DetailPrefetchRouter = {
  prefetch: (href: string) => void | Promise<void>;
};

type PrefetchFlight = {
  href: string;
  slug: string;
  requestAt: number;
  readyAt: number | null;
  durationMs: number | null;
  promise: Promise<void>;
};

const lastRequestAt = new Map<string, number>();
const flights = new Map<string, PrefetchFlight>();
let activePrefetch = 0;

const SUMMARY_PREWARM_SOURCES = new Set<DeliveryStoreDetailPrefetchSource>([
  "viewport",
  "pointer_enter",
  "pointer_down",
  "touch_start",
]);

export function storeDetailHrefFromSlug(slug: string): string {
  return `/stores/${encodeURIComponent(slug.trim())}`;
}

async function awaitRouterPrefetch(
  router: DetailPrefetchRouter,
  href: string
): Promise<void> {
  const result = router.prefetch(href);
  if (result != null && typeof (result as Promise<void>).then === "function") {
    await result;
    return;
  }
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
      return;
    }
    setTimeout(resolve, 16);
  });
}

function startPrefetchFlight(
  router: DetailPrefetchRouter,
  href: string,
  slug: string,
  source: DeliveryStoreDetailPrefetchSource,
  requestAt: number
): PrefetchFlight {
  const promise = (async () => {
    const started = Date.now();
    try {
      await awaitRouterPrefetch(router, href);
    } finally {
      const durationMs = Math.max(0, Date.now() - started);
      const flight = flights.get(href);
      if (flight) {
        flight.readyAt = Date.now();
        flight.durationMs = durationMs;
      }
      deliveryStorePrefetchMarkComplete(href, source, requestAt, durationMs);
      flights.delete(href);
      activePrefetch = Math.max(0, activePrefetch - 1);
    }
  })();

  const flight: PrefetchFlight = {
    href,
    slug,
    requestAt,
    readyAt: null,
    durationMs: null,
    promise,
  };
  flights.set(href, flight);
  return flight;
}

/**
 * @returns true if a new router.prefetch flight was scheduled
 */
export function deliveryStoreDetailPrefetch(
  router: DetailPrefetchRouter,
  slug: string,
  source: DeliveryStoreDetailPrefetchSource,
  opts?: { force?: boolean }
): boolean {
  const s = slug.trim();
  if (!s) return false;
  const href = storeDetailHrefFromSlug(s);
  const now = Date.now();
  const last = lastRequestAt.get(href) ?? 0;
  const ageMs = now - last;

  if (!opts?.force && ageMs < PREFETCH_MIN_GAP_MS) {
    deliveryStorePrefetchMarkSkipped(href, source, "min_gap", ageMs);
    return false;
  }

  const existing = flights.get(href);
  if (existing && existing.readyAt == null) {
    deliveryStorePrefetchMarkSingleFlight(href, source);
    if (SUMMARY_PREWARM_SOURCES.has(source)) {
      deliveryStoreSummaryPrewarmMaybe(s, source);
    }
    return opts?.force ? true : false;
  }

  if (!opts?.force && activePrefetch >= MAX_ACTIVE_PREFETCH) {
    deliveryStorePrefetchMarkSkipped(href, source, "max_active", ageMs);
    return false;
  }

  lastRequestAt.set(href, now);
  activePrefetch += 1;
  const requestAt = deliveryStorePrefetchMarkRequest(href, source);

  startPrefetchFlight(router, href, s, source, requestAt);

  if (SUMMARY_PREWARM_SOURCES.has(source)) {
    deliveryStoreSummaryPrewarmMaybe(s, source);
  }

  return true;
}

export function deliveryStoreDetailPrefetchCheckBeforeTap(
  href: string
): DeliveryStorePrefetchTapState {
  const key = href.trim();
  const flight = flights.get(key);
  const inflight = !!flight && flight.readyAt == null;
  return deliveryStorePrefetchResolveTapState(href, {
    requestAt: flight?.requestAt ?? deliveryStorePrefetchReadRequestAt(href),
    readyAt: flight?.readyAt ?? deliveryStorePrefetchReadReadyAt(href),
    durationMs: flight?.durationMs ?? deliveryStorePrefetchReadDurationMs(href),
    inflight,
  });
}

/**
 * overlay·seed 는 호출 전에 표시한 뒤 pushFn 만 스케줄.
 * inflight → ready promise 또는 최대 TAP_PUSH_MAX_WAIT_MS.
 */
export function deliveryStoreDetailScheduleTapPush(
  href: string,
  tap: DeliveryStorePrefetchTapState,
  pushFn: () => void
): void {
  const flight = flights.get(href.trim());

  if (tap.was_prefetch_ready) {
    queueMicrotask(pushFn);
    return;
  }

  if (tap.was_prefetch_inflight && flight?.promise) {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      pushFn();
    };
    void flight.promise.finally(run);
    setTimeout(run, TAP_PUSH_MAX_WAIT_MS);
    return;
  }

  queueMicrotask(pushFn);
}

export function deliveryStoreDetailPrefetchFlightForTests(
  href: string
): PrefetchFlight | undefined {
  return flights.get(href.trim());
}

export function resetDeliveryStoreDetailPrefetchForTests(): void {
  lastRequestAt.clear();
  flights.clear();
  activePrefetch = 0;
}
