"use client";

import {
  deliveryPerfTraceEnabled,
  deliveryPerfTraceLog,
  DELIVERY_PERF_TAG_PREFETCH_AGE_MS,
  DELIVERY_PERF_TAG_PREFETCH_COMPLETE,
  DELIVERY_PERF_TAG_PREFETCH_HIT,
  DELIVERY_PERF_TAG_PREFETCH_INFLIGHT,
  DELIVERY_PERF_TAG_PREFETCH_MISS,
  DELIVERY_PERF_TAG_PREFETCH_REQUEST,
  DELIVERY_PERF_TAG_PREFETCH_SINGLE_FLIGHT,
  DELIVERY_PERF_TAG_PREFETCH_SKIPPED,
} from "@/lib/dibay/delivery-perf-trace";

/** tap 직전 ready 판정 TTL */
export const DELIVERY_STORE_DETAIL_PREFETCH_TTL_MS = 60_000;

const K_PREFETCH_REQ = "dibay:store-prefetch-req:";
const K_PREFETCH_READY = "dibay:store-prefetch-ready:";
const K_PREFETCH_DUR = "dibay:store-prefetch-dur:";

function reqKey(href: string): string {
  return K_PREFETCH_REQ + href.trim();
}
function readyKey(href: string): string {
  return K_PREFETCH_READY + href.trim();
}
function durKey(href: string): string {
  return K_PREFETCH_DUR + href.trim();
}

export type DeliveryStorePrefetchTapState = {
  was_prefetched_request: boolean;
  was_prefetch_ready: boolean;
  was_prefetch_inflight: boolean;
  prefetch_request_age_ms: number | null;
  prefetch_ready_age_ms: number | null;
  prefetch_duration_ms: number | null;
  /** breakdown 호환 */
  hit: boolean;
  age_ms: number | null;
};

export function deliveryStorePrefetchPersistRequest(href: string): number {
  const at = Date.now();
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(reqKey(href), String(at));
      sessionStorage.removeItem(readyKey(href));
      sessionStorage.removeItem(durKey(href));
    } catch {
      /* quota */
    }
  }
  return at;
}

export function deliveryStorePrefetchPersistReady(
  href: string,
  requestAt: number,
  durationMs: number
): number {
  const at = Date.now();
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(readyKey(href), String(at));
      sessionStorage.setItem(durKey(href), String(durationMs));
    } catch {
      /* quota */
    }
  }
  return at;
}

export function deliveryStorePrefetchReadRequestAt(href: string): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(reqKey(href));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function deliveryStorePrefetchReadReadyAt(href: string): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(readyKey(href));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function deliveryStorePrefetchReadDurationMs(href: string): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(durKey(href));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function deliveryStorePrefetchMarkRequest(href: string, source: string): number {
  const at = deliveryStorePrefetchPersistRequest(href);
  if (deliveryPerfTraceEnabled()) {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_PREFETCH_REQUEST, {
    event: "prefetch_request",
    href,
    source,
    prefetch_age_ms: null,
  });
  }
  return at;
}

/** router.prefetch 가 상한 내 끝나지 않음 — ready 로 취급하지 않음 */
export function deliveryStorePrefetchMarkTimedOut(
  href: string,
  source: string,
  waitMs: number
): void {
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(readyKey(href));
      sessionStorage.removeItem(durKey(href));
    } catch {
      /* quota */
    }
  }
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_PREFETCH_SKIPPED, {
    event: "prefetch_timed_out",
    href,
    source,
    reason: "flight_timeout",
    prefetch_age_ms: waitMs,
  });
}

export function deliveryStorePrefetchMarkComplete(
  href: string,
  source: string,
  requestAt: number,
  durationMs: number
): void {
  deliveryStorePrefetchPersistReady(href, requestAt, durationMs);
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_PREFETCH_COMPLETE, {
    event: "prefetch_complete",
    href,
    source,
    prefetch_duration_ms: durationMs,
    prefetch_ready_age_ms: 0,
  });
}

export function deliveryStorePrefetchMarkSkipped(
  href: string,
  source: string,
  reason: "min_gap" | "max_active",
  prefetch_age_ms: number
): void {
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_PREFETCH_SKIPPED, {
    event: "prefetch_skipped",
    href,
    source,
    reason,
    prefetch_age_ms,
  });
}

export function deliveryStorePrefetchMarkSingleFlight(href: string, source: string): void {
  if (!deliveryPerfTraceEnabled()) return;
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_PREFETCH_SINGLE_FLIGHT, {
    event: "prefetch_single_flight",
    href,
    source,
  });
}

export function deliveryStorePrefetchResolveTapState(
  href: string,
  opts: {
    requestAt: number | null;
    readyAt: number | null;
    durationMs: number | null;
    inflight: boolean;
  }
): DeliveryStorePrefetchTapState {
  const now = Date.now();
  const requestAt = opts.requestAt ?? deliveryStorePrefetchReadRequestAt(href);
  const readyAt = opts.readyAt ?? deliveryStorePrefetchReadReadyAt(href);
  const durationMs = opts.durationMs ?? deliveryStorePrefetchReadDurationMs(href);

  const was_prefetched_request = requestAt != null;
  const prefetch_request_age_ms =
    requestAt != null ? Math.max(0, now - requestAt) : null;
  const prefetch_ready_age_ms =
    readyAt != null ? Math.max(0, now - readyAt) : null;

  const was_prefetch_ready =
    readyAt != null &&
    prefetch_ready_age_ms != null &&
    prefetch_ready_age_ms <= DELIVERY_STORE_DETAIL_PREFETCH_TTL_MS;

  const was_prefetch_inflight =
    was_prefetched_request && !was_prefetch_ready && opts.inflight;

  if (deliveryPerfTraceEnabled()) {
    if (!was_prefetched_request) {
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_PREFETCH_MISS, {
        event: "prefetch_miss_before_tap",
        href,
        prefetch_request_age_ms: null,
        prefetch_ready_age_ms: null,
      });
    } else if (was_prefetch_ready) {
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_PREFETCH_HIT, {
        event: "prefetch_ready_before_tap",
        href,
        prefetch_request_age_ms,
        prefetch_ready_age_ms,
        prefetch_duration_ms: durationMs,
      });
    } else if (was_prefetch_inflight) {
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_PREFETCH_INFLIGHT, {
        event: "prefetch_inflight_before_tap",
        href,
        prefetch_request_age_ms,
        prefetch_ready_age_ms: null,
        prefetch_duration_ms: durationMs,
      });
    } else {
      deliveryPerfTraceLog(DELIVERY_PERF_TAG_PREFETCH_MISS, {
        event: "prefetch_miss_before_tap",
        href,
        prefetch_request_age_ms,
        prefetch_ready_age_ms: null,
        reason: "stale_request",
      });
    }

    deliveryPerfTraceLog(DELIVERY_PERF_TAG_PREFETCH_AGE_MS, {
      event: "prefetch_age_ms",
      href,
      prefetch_request_age_ms,
      prefetch_ready_age_ms,
      prefetch_duration_ms: durationMs,
      was_prefetch_ready,
      was_prefetch_inflight,
    });
  }

  return {
    was_prefetched_request,
    was_prefetch_ready,
    was_prefetch_inflight,
    prefetch_request_age_ms,
    prefetch_ready_age_ms,
    prefetch_duration_ms: durationMs,
    hit: was_prefetch_ready,
    age_ms: prefetch_ready_age_ms ?? prefetch_request_age_ms,
  };
}

/** @deprecated use deliveryStorePrefetchResolveTapState via deliveryStoreDetailPrefetchCheckBeforeTap */
export function deliveryStorePrefetchCheckBeforeTap(href: string): DeliveryStorePrefetchTapState {
  return deliveryStorePrefetchResolveTapState(href, {
    requestAt: deliveryStorePrefetchReadRequestAt(href),
    readyAt: deliveryStorePrefetchReadReadyAt(href),
    durationMs: deliveryStorePrefetchReadDurationMs(href),
    inflight: false,
  });
}

export function resetDeliveryStorePrefetchTraceForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (
      k?.startsWith(K_PREFETCH_REQ) ||
      k?.startsWith(K_PREFETCH_READY) ||
      k?.startsWith(K_PREFETCH_DUR)
    ) {
      keys.push(k);
    }
  }
  for (const k of keys) sessionStorage.removeItem(k);
}
