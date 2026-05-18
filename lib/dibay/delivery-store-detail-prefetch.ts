"use client";

/**
 * 배달 매장 상세 `/stores/[slug]` route prefetch — ready/in-flight/miss·tap push 스케줄.
 *
 * CONTRACT: `router.prefetch` 키는 탭 시 `router.push` 와 **동일 href**(쿼리 포함)여야 한다.
 * `focusProduct` 탭은 base `/stores/{slug}` prefetch 만으로는 RSC hit 불가.
 */

import {
  deliveryStorePrefetchMarkComplete,
  deliveryStorePrefetchMarkRequest,
  deliveryStorePrefetchMarkSingleFlight,
  deliveryStorePrefetchMarkSkipped,
  deliveryStorePrefetchMarkTimedOut,
  deliveryStorePrefetchReadDurationMs,
  deliveryStorePrefetchReadReadyAt,
  deliveryStorePrefetchReadRequestAt,
  deliveryStorePrefetchResolveTapState,
  type DeliveryStorePrefetchTapState,
} from "@/lib/dibay/delivery-store-prefetch-trace";
import { deliveryStoreDetailPrewarmAll } from "@/lib/dibay/delivery-store-detail-prewarm";
import { deliveryStoreSummaryPrewarmMaybe } from "@/lib/dibay/delivery-store-summary-prewarm";
import {
  deliveryPerfTraceEnabled,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import {
  buildStoreDetailHref,
  normalizeStoreDetailHref,
  parseStoreDetailFocusProductId,
  parseStoreDetailSlugFromHref,
  storeDetailBaseHref,
} from "@/lib/dibay/store-detail-href";

export { buildStoreDetailHref, storeDetailHrefFromSlug } from "@/lib/dibay/store-detail-href";

const PREFETCH_MIN_GAP_MS = 2_000;
const MAX_ACTIVE_PREFETCH = 4;
/** router.prefetch flight 상한 — 초과 시 stuck inflight 해제 */
function prefetchFlightMaxMs(): number {
  if (process.env.NODE_ENV !== "production") return 5_000;
  return 2_500;
}

/** 이 이상 inflight 이면 hung 로 보고 tap push 즉시·flight 재시작 */
function prefetchFlightStaleMs(): number {
  if (process.env.NODE_ENV !== "production") return 2_500;
  return 1_200;
}

/** inflight 시 router.push 추가 대기(짧게 — shell·menus prewarm 이 이미 떠 있음) */
function tapPushMaxWaitMs(): number {
  if (process.env.NODE_ENV !== "production") return 600;
  return 400;
}
const DELIVERY_PERF_TAG_PREFETCH_BEFORE_TAP = "[delivery-prefetch-before-tap]" as const;

function prefetchBeforeTapReason(tap: DeliveryStorePrefetchTapState): string {
  if (tap.was_prefetch_ready) return "ready";
  if (tap.was_prefetch_inflight) return "inflight";
  if (tap.was_prefetched_request) return "stale_request";
  return "miss";
}

function logDeliveryPrefetchBeforeTap(opts: {
  href: string;
  prefetch_key: string;
  prefetch_hit: boolean;
  has_focus_product: boolean;
  reason: string;
  prefetch_request_age_ms: number | null;
}): void {
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(
    DELIVERY_PERF_TAG_PREFETCH_BEFORE_TAP as Parameters<typeof deliveryPerfTraceLog>[0],
    {
      event: "prefetch_before_tap",
      event_key: `${opts.prefetch_key}::${opts.reason}`,
      href: opts.href,
      prefetch_key: opts.prefetch_key,
      prefetch_hit: opts.prefetch_hit,
      has_focus_product: opts.has_focus_product,
      reason: opts.reason,
      prefetch_request_age_ms: opts.prefetch_request_age_ms,
    }
  );
}

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

export type DeliveryStoreDetailPrefetchOpts = {
  force?: boolean;
  /** 탭·push 와 동일한 전체 href (`?focusProduct=` 포함) */
  href?: string;
  focusProductId?: string | null;
};

function resolvePrefetchTarget(
  slug: string,
  opts?: DeliveryStoreDetailPrefetchOpts
): { href: string; slug: string } {
  const fallbackSlug = slug.trim();
  if (opts?.href?.trim()) {
    const href = normalizeStoreDetailHref(opts.href.trim());
    const parsed = parseStoreDetailSlugFromHref(href);
    return { href, slug: (parsed ?? fallbackSlug).trim() };
  }
  return {
    href: normalizeStoreDetailHref(buildStoreDetailHref(fallbackSlug, opts?.focusProductId)),
    slug: fallbackSlug,
  };
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

async function awaitRouterPrefetchWithCap(
  router: DetailPrefetchRouter,
  href: string
): Promise<"ok" | "timeout"> {
  const capMs = prefetchFlightMaxMs();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), capMs);
  });
  try {
    const work = awaitRouterPrefetch(router, href).then(() => "ok" as const);
    const outcome = await Promise.race([work, cap]);
    return outcome === "ok" ? "ok" : "timeout";
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

function releasePrefetchFlight(flight: PrefetchFlight, href: string): void {
  if (flights.get(href) === flight) {
    flights.delete(href);
    activePrefetch = Math.max(0, activePrefetch - 1);
  }
}

function abortStalePrefetchFlight(href: string, source: string): void {
  const flight = flights.get(href);
  if (!flight || flight.readyAt != null) return;
  const waitMs = Math.max(0, Date.now() - flight.requestAt);
  if (waitMs < prefetchFlightStaleMs()) return;
  releasePrefetchFlight(flight, href);
  deliveryStorePrefetchMarkTimedOut(href, source, waitMs);
}

function startPrefetchFlight(
  router: DetailPrefetchRouter,
  href: string,
  slug: string,
  source: DeliveryStoreDetailPrefetchSource,
  requestAt: number
): PrefetchFlight {
  const flight: PrefetchFlight = {
    href,
    slug,
    requestAt,
    readyAt: null,
    durationMs: null,
    promise: Promise.resolve(),
  };

  flight.promise = (async () => {
    const started = Date.now();
    const outcome = await awaitRouterPrefetchWithCap(router, href);
    const durationMs = Math.max(0, Date.now() - started);
    if (flights.get(href) !== flight) return;

    flight.readyAt = outcome === "ok" ? Date.now() : null;
    flight.durationMs = durationMs;
    releasePrefetchFlight(flight, href);

    if (outcome === "ok") {
      deliveryStorePrefetchMarkComplete(href, source, requestAt, durationMs);
    } else {
      deliveryStorePrefetchMarkTimedOut(href, source, durationMs);
    }
  })();

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
  opts?: DeliveryStoreDetailPrefetchOpts
): boolean {
  const { href, slug: s } = resolvePrefetchTarget(slug, opts);
  if (!s) return false;
  const now = Date.now();
  const last = lastRequestAt.get(href) ?? 0;
  const ageMs = now - last;

  if (!opts?.force && ageMs < PREFETCH_MIN_GAP_MS) {
    deliveryStorePrefetchMarkSkipped(href, source, "min_gap", ageMs);
    return false;
  }

  const existing = flights.get(href);
  if (existing && existing.readyAt == null) {
    const inflightAge = now - existing.requestAt;
    if (inflightAge >= prefetchFlightStaleMs()) {
      abortStalePrefetchFlight(href, source);
    } else {
      deliveryStorePrefetchMarkSingleFlight(href, source);
      if (SUMMARY_PREWARM_SOURCES.has(source)) {
        deliveryStoreDetailPrewarmAll(s);
        deliveryStoreSummaryPrewarmMaybe(s, source);
      }
      return opts?.force ? true : false;
    }
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
    deliveryStoreDetailPrewarmAll(s, opts?.force ? { force: true } : undefined);
    deliveryStoreSummaryPrewarmMaybe(s, source);
  }

  return true;
}

export function deliveryStoreDetailPrefetchCheckBeforeTap(
  href: string,
  opts?: { logBeforeTap?: boolean }
): DeliveryStorePrefetchTapState {
  const key = normalizeStoreDetailHref(href);
  const flight = flights.get(key);
  const inflight = !!flight && flight.readyAt == null;
  const tap = deliveryStorePrefetchResolveTapState(key, {
    requestAt: flight?.requestAt ?? deliveryStorePrefetchReadRequestAt(key),
    readyAt: flight?.readyAt ?? deliveryStorePrefetchReadReadyAt(key),
    durationMs: flight?.durationMs ?? deliveryStorePrefetchReadDurationMs(key),
    inflight,
  });
  if (opts?.logBeforeTap !== false) {
    const requestAge = tap.prefetch_request_age_ms;
    let reason = prefetchBeforeTapReason(tap);
    if (
      tap.was_prefetch_inflight &&
      requestAge != null &&
      requestAge >= prefetchFlightStaleMs()
    ) {
      reason = "inflight_stale";
    }
    logDeliveryPrefetchBeforeTap({
      href: key,
      prefetch_key: key,
      prefetch_hit: tap.hit,
      has_focus_product: parseStoreDetailFocusProductId(key) != null,
      reason,
      prefetch_request_age_ms: requestAge,
    });
  }
  return tap;
}

/**
 * 탭 직전: 이동 href 와 동일 키로 prefetch 후 상태 반환.
 * focusProduct 탭은 focused href 우선, base href 는 여유 있을 때만 보조 prefetch.
 */
export function deliveryStoreDetailPrefetchForTap(
  router: DetailPrefetchRouter,
  slug: string,
  href: string
): DeliveryStorePrefetchTapState {
  const key = normalizeStoreDetailHref(href);
  const hasFocus = parseStoreDetailFocusProductId(key) != null;
  const baseHref = storeDetailBaseHref(key);

  deliveryStoreDetailPrefetch(router, slug, "card_click", { force: true, href: key });

  if (hasFocus && baseHref !== key && activePrefetch < MAX_ACTIVE_PREFETCH) {
    deliveryStoreDetailPrefetch(router, slug, "card_click", { href: baseHref });
  }

  return deliveryStoreDetailPrefetchCheckBeforeTap(href);
}

/**
 * overlay·seed 는 호출 전에 표시한 뒤 pushFn 만 스케줄.
 * inflight → prefetch promise 완료 시 push, 최대 tapPushMaxWaitMs() 후 fallback push.
 */
export function deliveryStoreDetailScheduleTapPush(
  href: string,
  tap: DeliveryStorePrefetchTapState,
  pushFn: () => void,
  opts?: { immediate?: boolean }
): void {
  if (opts?.immediate) {
    pushFn();
    return;
  }

  const key = normalizeStoreDetailHref(href);
  const flight = flights.get(key);
  const maxWaitMs = tapPushMaxWaitMs();

  if (tap.was_prefetch_ready) {
    queueMicrotask(pushFn);
    return;
  }

  if (tap.was_prefetch_inflight && flight?.promise) {
    const requestAge = tap.prefetch_request_age_ms ?? 0;
    if (requestAge >= prefetchFlightStaleMs()) {
      queueMicrotask(pushFn);
      return;
    }
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      pushFn();
    };
    const remaining = Math.max(0, maxWaitMs - requestAge);
    void flight.promise.finally(run);
    setTimeout(run, remaining);
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
