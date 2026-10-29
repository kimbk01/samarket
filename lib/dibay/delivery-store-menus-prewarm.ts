"use client";

/**
 * 매장 카드 탭·pointer intent 시 menus API 선요청 — route cold prefetch 와 분리.
 * `fetchStoreMenusDeduped` 캐시·single-flight 재사용.
 *
 * v4 W3 PERF-04 — 「시작」 기록은 menus 캐시 TTL 과 같은 시간만 유지(만료 후 재prewarm 허용).
 */

import { fetchStoreMenusDeduped } from "@/lib/stores/store-delivery-api-client";
import { STORE_MENUS_PUBLIC_CACHE_TTL_MS } from "@/lib/stores/store-delivery-client-cache-ttl";
import {
  isAbortError,
  resolveStoresBrowseAmbientPrewarmSignal,
  shouldStartStoresBrowseAmbientPrewarm,
} from "@/lib/dibay/delivery-store-detail-prewarm-lifecycle";

const prewarmStartedAt = new Map<string, number>();

function slugKey(slug: string): string {
  return slug.trim().toLowerCase();
}

function isStartFresh(s: string): boolean {
  const at = prewarmStartedAt.get(s);
  if (at == null) return false;
  if (Date.now() - at < STORE_MENUS_PUBLIC_CACHE_TTL_MS) return true;
  prewarmStartedAt.delete(s);
  return false;
}

/**
 * 시작했으면 완료(성공·실패) 시 resolve 되는 promise, 건너뛰면 null.
 * 동시 상한 큐(`delivery-store-detail-prewarm`)가 완료 시점을 알기 위해 쓴다.
 */
export function deliveryStoreMenusPrewarmTracked(
  slug: string,
  opts?: { force?: boolean }
): Promise<void> | null {
  const s = slugKey(slug);
  if (!s || typeof window === "undefined") return null;
  if (!shouldStartStoresBrowseAmbientPrewarm(opts)) return null;
  if (!opts?.force && isStartFresh(s)) return null;
  prewarmStartedAt.set(s, Date.now());

  const signal = resolveStoresBrowseAmbientPrewarmSignal(opts);
  return fetchStoreMenusDeduped(s, { signal }).then(
    () => undefined,
    (error) => {
      prewarmStartedAt.delete(s);
      if (isAbortError(error)) return;
    }
  );
}

/** 탭·pointer_down 직후 호출 — 상세 마운트 전 menus fetch 시작 */
export function deliveryStoreMenusPrewarm(slug: string, opts?: { force?: boolean }): void {
  void deliveryStoreMenusPrewarmTracked(slug, opts);
}

/** slug 변경·테스트 리셋 */
export function resetDeliveryStoreMenusPrewarmForTests(): void {
  prewarmStartedAt.clear();
}
