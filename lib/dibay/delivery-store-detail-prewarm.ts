"use client";

/**
 * 매장 상세 cold·warm 공통 — summary·banners·menus 선요청.
 * 첫 방문·재방문 체감 차이를 줄이기 위해 viewport·pointer intent 에서 동일 세트를 호출한다.
 *
 * v4 W3 PERF-04
 * - 「시작」 기록은 각 캐시 TTL(summary 15s·banners 12s·menus 15s)과 같은 시간만 유지 — 캐시 만료 뒤 재prewarm 허용.
 * - non-force(viewport 등 ambient) 매장 단위 prewarm 은 동시 상한(매장 2곳 = 요청 최대 6건) 큐로 보낸다.
 *   카드 N장이 한꺼번에 보여도 3N 동시 요청이 나가지 않는다. 큐가 넘치면 오래된 대기부터 버린다(화면 밖으로 지나간 카드).
 * - force(탭·pointer intent) 는 큐를 거치지 않고 즉시 시작.
 */

import { fetchStoreBannersDeduped, fetchStoreSummaryDeduped } from "@/lib/stores/store-delivery-api-client";
import {
  STORE_BANNERS_PUBLIC_CACHE_TTL_MS,
  STORE_SUMMARY_PUBLIC_CACHE_TTL_MS,
} from "@/lib/stores/store-delivery-client-cache-ttl";
import { deliveryStoreMenusPrewarmTracked } from "@/lib/dibay/delivery-store-menus-prewarm";
import {
  isAbortError,
  resolveStoresBrowseAmbientPrewarmSignal,
  shouldStartStoresBrowseAmbientPrewarm,
} from "@/lib/dibay/delivery-store-detail-prewarm-lifecycle";

/** ambient 매장 prewarm 동시 실행 상한 (매장 수) */
export const DELIVERY_STORE_AMBIENT_PREWARM_MAX_CONCURRENT = 2;
/** ambient 대기열 상한 — 초과 시 가장 오래된 대기 slug 버림 */
export const DELIVERY_STORE_AMBIENT_PREWARM_MAX_QUEUE = 6;
/** 응답이 멈춘 매장이 슬롯을 영구 점유하지 않도록 슬롯 반환 상한 */
const AMBIENT_PREWARM_SLOT_MAX_MS = 8_000;

const summaryStartedAt = new Map<string, number>();
const bannersStartedAt = new Map<string, number>();

let ambientActive = 0;
const ambientQueue: string[] = [];

function slugKey(slug: string): string {
  return slug.trim().toLowerCase();
}

function isStartFresh(map: Map<string, number>, s: string, ttlMs: number): boolean {
  const at = map.get(s);
  if (at == null) return false;
  if (Date.now() - at < ttlMs) return true;
  map.delete(s);
  return false;
}

function summaryPrewarmTracked(slug: string, opts?: { force?: boolean }): Promise<void> | null {
  const s = slugKey(slug);
  if (!s || typeof window === "undefined") return null;
  if (!shouldStartStoresBrowseAmbientPrewarm(opts)) return null;
  if (!opts?.force && isStartFresh(summaryStartedAt, s, STORE_SUMMARY_PUBLIC_CACHE_TTL_MS)) return null;
  summaryStartedAt.set(s, Date.now());

  const signal = resolveStoresBrowseAmbientPrewarmSignal(opts);
  return fetchStoreSummaryDeduped(s, { signal }).then(
    () => undefined,
    (error) => {
      summaryStartedAt.delete(s);
      if (isAbortError(error)) return;
    }
  );
}

function bannersPrewarmTracked(slug: string, opts?: { force?: boolean }): Promise<void> | null {
  const s = slugKey(slug);
  if (!s || typeof window === "undefined") return null;
  if (!shouldStartStoresBrowseAmbientPrewarm(opts)) return null;
  if (!opts?.force && isStartFresh(bannersStartedAt, s, STORE_BANNERS_PUBLIC_CACHE_TTL_MS)) return null;
  bannersStartedAt.set(s, Date.now());
  return fetchStoreBannersDeduped(s).then(
    () => undefined,
    () => {
      bannersStartedAt.delete(s);
    }
  );
}

export function deliveryStoreSummaryPrewarmAlways(slug: string, opts?: { force?: boolean }): void {
  void summaryPrewarmTracked(slug, opts);
}

export function deliveryStoreBannersPrewarmAlways(slug: string, opts?: { force?: boolean }): void {
  void bannersPrewarmTracked(slug, opts);
}

function runStorePrewarmSet(slug: string, opts?: { force?: boolean }): Promise<void> {
  const flights = [
    deliveryStoreMenusPrewarmTracked(slug, opts),
    summaryPrewarmTracked(slug, opts),
    bannersPrewarmTracked(slug, opts),
  ].filter((p): p is Promise<void> => p != null);
  if (flights.length === 0) return Promise.resolve();
  return Promise.all(flights).then(() => undefined);
}

function pumpAmbientQueue(): void {
  while (ambientActive < DELIVERY_STORE_AMBIENT_PREWARM_MAX_CONCURRENT && ambientQueue.length > 0) {
    const s = ambientQueue.shift()!;
    ambientActive += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      ambientActive = Math.max(0, ambientActive - 1);
      pumpAmbientQueue();
    };
    const timer = setTimeout(release, AMBIENT_PREWARM_SLOT_MAX_MS);
    void runStorePrewarmSet(s).finally(release);
  }
}

function allStartsFresh(s: string): boolean {
  return (
    isStartFresh(summaryStartedAt, s, STORE_SUMMARY_PUBLIC_CACHE_TTL_MS) &&
    isStartFresh(bannersStartedAt, s, STORE_BANNERS_PUBLIC_CACHE_TTL_MS)
  );
}

/** menus + summary + banners — 탭·뷰포트 공통 */
export function deliveryStoreDetailPrewarmAll(slug: string, opts?: { force?: boolean }): void {
  if (opts?.force) {
    void runStorePrewarmSet(slug, opts);
    return;
  }
  const s = slugKey(slug);
  if (!s || typeof window === "undefined") return;
  if (!shouldStartStoresBrowseAmbientPrewarm(opts)) return;
  if (allStartsFresh(s)) return;
  if (ambientQueue.includes(s)) return;
  ambientQueue.push(s);
  while (ambientQueue.length > DELIVERY_STORE_AMBIENT_PREWARM_MAX_QUEUE) ambientQueue.shift();
  pumpAmbientQueue();
}

export function readDeliveryStoreAmbientPrewarmStateForTests(): { active: number; queued: readonly string[] } {
  return { active: ambientActive, queued: [...ambientQueue] };
}

export function resetDeliveryStoreDetailPrewarmForTests(): void {
  summaryStartedAt.clear();
  bannersStartedAt.clear();
  ambientQueue.length = 0;
  ambientActive = 0;
}
