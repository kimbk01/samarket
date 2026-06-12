"use client";

/**
 * 매장 카드 탭·pointer intent 시 menus API 선요청 — route cold prefetch 와 분리.
 * `fetchStoreMenusDeduped` 캐시·single-flight 재사용.
 */

import { fetchStoreMenusDeduped } from "@/lib/stores/store-delivery-api-client";
import {
  isAbortError,
  resolveStoresBrowseAmbientPrewarmSignal,
  shouldStartStoresBrowseAmbientPrewarm,
} from "@/lib/dibay/delivery-store-detail-prewarm-lifecycle";

const prewarmStarted = new Set<string>();

function slugKey(slug: string): string {
  return slug.trim().toLowerCase();
}

/** 탭·pointer_down 직후 호출 — 상세 마운트 전 menus fetch 시작 */
export function deliveryStoreMenusPrewarm(slug: string, opts?: { force?: boolean }): void {
  const s = slugKey(slug);
  if (!s || typeof window === "undefined") return;
  if (!shouldStartStoresBrowseAmbientPrewarm(opts)) return;
  if (!opts?.force && prewarmStarted.has(s)) return;
  prewarmStarted.add(s);

  const signal = resolveStoresBrowseAmbientPrewarmSignal(opts);
  void fetchStoreMenusDeduped(s, { signal }).catch((error) => {
    prewarmStarted.delete(s);
    if (isAbortError(error)) return;
  });
}

/** slug 변경·테스트 리셋 */
export function resetDeliveryStoreMenusPrewarmForTests(): void {
  prewarmStarted.clear();
}
