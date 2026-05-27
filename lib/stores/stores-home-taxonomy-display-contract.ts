/**
 * CONTRACT — `/stores` 카테고리 UI (admin taxonomy 단일 소스).
 *
 * Authoritative: GET `/api/stores/taxonomy` (admin `/admin/stores/application-settings?menu=stores`).
 *
 * DO NOT on `/stores` home hub:
 * - `getStoresHomeTaxonomySeedState()` 로 첫 페인트
 * - `/public/icons/*` 정적 taxonomy fallback PNG
 * - `StoresHomeInitialShellServer` · SSR category seed · rail-view 교체
 * - server snapshot `taxonomyReady: true` without API/cache
 *
 * 검증: `npm run verify:stores-home-hub-contract` · `stores-home-taxonomy-display-contract.test.ts`
 */

import type { StoresHomeCategoryChromeSnapshot } from "@/lib/stores/stores-home-category-chrome-store";
import { STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT } from "@/lib/stores/stores-home-category-chrome-store";

/** SSR·hydration 초기 chrome — skeleton only */
export function getStoresHomeTaxonomyServerChromeContract(): StoresHomeCategoryChromeSnapshot {
  return STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT;
}

/** seed/legacy PNG 선렌더 회귀 */
export function detectStoresHomeLegacyTaxonomyPaintRegression(opts: {
  taxonomyReady: boolean;
  usedTaxonomySeed: boolean;
  usedLegacyFallbackIcons: boolean;
}): boolean {
  if (opts.usedTaxonomySeed) return true;
  if (opts.usedLegacyFallbackIcons) return true;
  if (opts.taxonomyReady && opts.usedTaxonomySeed) return true;
  return false;
}

/** server snapshot 이 API 없이 ready 로 시작하면 hydration·구 UI 재노출 */
export function detectStoresHomeTaxonomyServerSnapshotRegression(
  snapshot: Pick<StoresHomeCategoryChromeSnapshot, "taxonomyReady" | "primaries" | "subs">
): boolean {
  if (!snapshot.taxonomyReady) return false;
  if (snapshot.primaries.length === 0 && snapshot.subs.length === 0) return false;
  return snapshot.taxonomyReady;
}
