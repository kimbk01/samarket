"use client";

import {
  deliveryPerfTraceLog,
  DELIVERY_PERF_TAG_SEED_SUMMARY_PATCH,
  DELIVERY_PERF_TAG_SEED_SUMMARY_PATCH_MS,
} from "@/lib/dibay/delivery-perf-trace";

const KEY_PREFIX_NAV = "dibay:store-detail-seed-nav:";
const KEY_PREFIX_PASS1 = "dibay:store-detail-seed-pass1:";
const TTL_MS = 45_000;

/** TTL·구간 ms — `performance.now()` 와 `Date.now()` 혼용 시 readTs 가 즉시 만료 처리함 */
function wallClockMs(): number {
  return Date.now();
}

function ssKey(prefix: string, slug: string): string {
  return prefix + slug.trim().toLowerCase();
}

function readTs(key: string): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t?: number };
    if (!parsed?.t || parsed.t + TTL_MS < Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.t;
  } catch {
    return null;
  }
}

function writeTs(key: string, t: number): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ t }));
  } catch {
    /* quota */
  }
}

function removeKey(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** 목록 카드 탭 — seed→summary patch 벽시계 기준점 */
export function markStoreDetailListSeedNavigation(slug: string): void {
  const s = slug.trim();
  if (!s) return;
  writeTs(ssKey(KEY_PREFIX_NAV, s), wallClockMs());
}

/** PASS1 list seed 첫 paint */
export function markStoreDetailListSeedPass1Visible(slug: string): void {
  const s = slug.trim();
  if (!s) return;
  writeTs(ssKey(KEY_PREFIX_PASS1, s), wallClockMs());
}

export type StoreDetailSeedSummaryPatchTrace = {
  slug: string;
  pass1_to_summary_ms: number | null;
  click_to_summary_ms: number | null;
};

/** summary API 로 seed 행을 실매장 행으로 교체한 직후 */
export function traceStoreDetailSeedSummaryPatch(slug: string): StoreDetailSeedSummaryPatchTrace {
  const s = slug.trim();
  const navKey = ssKey(KEY_PREFIX_NAV, s);
  const pass1Key = ssKey(KEY_PREFIX_PASS1, s);
  const now = wallClockMs();
  const navT = readTs(navKey);
  const pass1T = readTs(pass1Key);
  removeKey(navKey);
  removeKey(pass1Key);

  const pass1ToSummaryMs =
    pass1T != null ? Math.max(0, Math.round(now - pass1T)) : null;
  const clickToSummaryMs = navT != null ? Math.max(0, Math.round(now - navT)) : null;

  deliveryPerfTraceLog(DELIVERY_PERF_TAG_SEED_SUMMARY_PATCH, {
    event: "seed_summary_patch",
    slug: s,
    had_pass1: pass1T != null,
    had_nav: navT != null,
  });
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_SEED_SUMMARY_PATCH_MS, {
    event: "seed_summary_patch_ms",
    slug: s,
    pass1_to_summary_ms: pass1ToSummaryMs,
    click_to_summary_ms: clickToSummaryMs,
  });

  return {
    slug: s,
    pass1_to_summary_ms: pass1ToSummaryMs,
    click_to_summary_ms: clickToSummaryMs,
  };
}

export function resetStoreDetailSeedPatchTraceForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(KEY_PREFIX_NAV) || k?.startsWith(KEY_PREFIX_PASS1)) keys.push(k);
  }
  for (const k of keys) sessionStorage.removeItem(k);
}
