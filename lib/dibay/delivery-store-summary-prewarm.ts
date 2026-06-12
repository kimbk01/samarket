"use client";

/**
 * 조건부 GET /api/stores/[slug]/summary prewarm — menus/reviews 제외.
 * arm: env 또는 route-ready인데도 push_to_page_enter > 100ms 관측 후.
 */

import { fetchStoreSummaryDeduped } from "@/lib/stores/store-delivery-api-client";
import {
  resolveStoresBrowseAmbientPrewarmSignal,
  shouldStartStoresBrowseAmbientPrewarm,
} from "@/lib/dibay/delivery-store-detail-prewarm-lifecycle";
import {
  deliveryPerfTraceEnabled,
  deliveryPerfTraceLog,
  DELIVERY_PERF_TAG_SUMMARY_PREWARM_COMPLETE,
  DELIVERY_PERF_TAG_SUMMARY_PREWARM_DURATION_MS,
  DELIVERY_PERF_TAG_SUMMARY_PREWARM_HIT,
  DELIVERY_PERF_TAG_SUMMARY_PREWARM_REQUEST,
} from "@/lib/dibay/delivery-perf-trace";

const K_ARMED = "dibay:summary-prewarm-armed";
const SUMMARY_PREWARM_TTL_MS = 45_000;

const lastRequestAt = new Map<string, number>();
const inFlight = new Set<string>();

function summaryPrewarmEnvOn(): boolean {
  return process.env.NEXT_PUBLIC_DIBAY_DELIVERY_SUMMARY_PREWARM === "1";
}

export function deliveryStoreSummaryPrewarmIsArmed(): boolean {
  if (summaryPrewarmEnvOn()) return true;
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(K_ARMED) === "1";
  } catch {
    return false;
  }
}

/** route-ready + cold push 관측 시 이후 viewport prewarm 에 summary 포함 */
export function deliveryStoreSummaryPrewarmArmFromSlowReadyRoute(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(K_ARMED, "1");
  } catch {
    /* quota */
  }
}

export function deliveryStoreSummaryPrewarmMaybe(slug: string, source: string): void {
  if (!deliveryStoreSummaryPrewarmIsArmed()) return;
  if (!shouldStartStoresBrowseAmbientPrewarm()) return;
  const s = slug.trim();
  if (!s) return;
  const now = Date.now();
  const last = lastRequestAt.get(s) ?? 0;
  if (now - last < SUMMARY_PREWARM_TTL_MS && inFlight.has(s)) return;
  if (now - last < 2_000) return;
  if (inFlight.has(s)) return;

  lastRequestAt.set(s, now);
  inFlight.add(s);
  const started = Date.now();

  if (deliveryPerfTraceEnabled()) {
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_SUMMARY_PREWARM_REQUEST, {
      event: "summary_prewarm_request",
      slug: s,
      source,
    });
  }

  void fetchStoreSummaryDeduped(s, { signal: resolveStoresBrowseAmbientPrewarmSignal() })
    .then(() => {
      const durationMs = Math.max(0, Date.now() - started);
      if (deliveryPerfTraceEnabled()) {
        deliveryPerfTraceLog(DELIVERY_PERF_TAG_SUMMARY_PREWARM_COMPLETE, {
          event: "summary_prewarm_complete",
          slug: s,
          source,
          summary_prewarm_duration_ms: durationMs,
        });
        deliveryPerfTraceLog(DELIVERY_PERF_TAG_SUMMARY_PREWARM_DURATION_MS, {
          event: "summary_prewarm_duration_ms",
          slug: s,
          summary_prewarm_duration_ms: durationMs,
        });
      }
    })
    .catch(() => {
      /* UX 무관 */
    })
    .finally(() => {
      inFlight.delete(s);
    });
}

export function deliveryStoreSummaryPrewarmCheckBeforeTap(slug: string): {
  hit: boolean;
  age_ms: number | null;
} {
  if (!deliveryStoreSummaryPrewarmIsArmed()) {
    return { hit: false, age_ms: null };
  }
  const s = slug.trim();
  const last = lastRequestAt.get(s) ?? null;
  if (last == null) return { hit: false, age_ms: null };
  const ageMs = Math.max(0, Date.now() - last);
  const hit = ageMs <= SUMMARY_PREWARM_TTL_MS && !inFlight.has(s);
  if (deliveryPerfTraceEnabled() && hit) {
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_SUMMARY_PREWARM_HIT, {
      event: "summary_prewarm_hit_before_tap",
      slug: s,
      summary_prewarm_age_ms: ageMs,
    });
  }
  return { hit, age_ms: ageMs };
}

export function resetDeliveryStoreSummaryPrewarmForTests(): void {
  lastRequestAt.clear();
  inFlight.clear();
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(K_ARMED);
  } catch {
    /* ignore */
  }
}
