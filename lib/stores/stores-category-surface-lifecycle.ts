import { deliveryConsumerStackDepth } from "@/lib/stores/delivery-consumer-stack-slide";
import { clearBrowsePrimaryPendingNav } from "@/lib/stores/browse-primary-tab-navigation";
import { clearBrowseSubPendingNav } from "@/lib/stores/browse-sub-chip-navigation";
import { resetBrowseSubtopicCollapseChromeForSessionExit } from "@/lib/stores/browse-subtopic-collapse-chrome";
import { resetHomeCategorySession } from "@/lib/stores/stores-home-category-chrome-store";

function pathOnly(pathKey: string): string {
  return pathKey.split("?")[0] ?? "";
}

export function isStoresHomeSurfacePath(pathKey: string): boolean {
  const p = pathOnly(pathKey);
  return p === "/stores" || p === "/stores/";
}

export function isStoresBrowseSurfacePath(pathKey: string): boolean {
  const p = pathOnly(pathKey);
  return p === "/stores/browse" || p.startsWith("/stores/browse/");
}

/**
 * NON-STORES — `/stores` consumer stack 밖 (community / chat / mypage / market / owner …).
 * store detail·cart 등 consumer depth ≥ 0 은 NON-STORES 가 아니다.
 */
export function isNonStoresSurfacePath(pathKey: string): boolean {
  const p = pathOnly(pathKey);
  if (!p.startsWith("/stores")) return true;
  return deliveryConsumerStackDepth(p) < 0;
}

export function parseBrowsePathnamePrimary(pathKey: string): string | null {
  const p = pathOnly(pathKey);
  const m = p.match(/^\/stores\/browse\/([^/]+)/);
  return m?.[1]?.trim().toLowerCase() ?? null;
}

/** BROWSE session exit — optimistic/pending·collapse 초기화 (URL derived state 제외) */
export function clearBrowseCategorySession(): void {
  clearBrowsePrimaryPendingNav();
  clearBrowseSubPendingNav();
  resetBrowseSubtopicCollapseChromeForSessionExit();
}

/**
 * HOME / BROWSE / NON-STORES surface transition — 단일 lifecycle authority.
 *
 * CONTRACT matrix (요약):
 * - HOME → BROWSE: HOME RESET
 * - BROWSE → HOME: HOME RESET + BROWSE PENDING RESET
 * - HOME|BROWSE → NON-STORES: HOME RESET + BROWSE PENDING RESET
 * - NON-STORES → HOME: HOME baseline + BROWSE PENDING RESET
 * - BROWSE → DETAIL / enter browse: pending clear (URL wins)
 *
 * Call sites: `StoresCategoryLifecycleBridge` (app-wide) + DeliveryPresentationShell (in-tree).
 */
export function applyStoresCategorySurfaceTransition(prevPathKey: string, nextPathKey: string): void {
  const wasHome = isStoresHomeSurfacePath(prevPathKey);
  const wasBrowse = isStoresBrowseSurfacePath(prevPathKey);
  const wasNonStores = isNonStoresSurfacePath(prevPathKey);
  const isHome = isStoresHomeSurfacePath(nextPathKey);
  const isBrowse = isStoresBrowseSurfacePath(nextPathKey);
  const isNonStores = isNonStoresSurfacePath(nextPathKey);

  if (wasHome && isBrowse) {
    resetHomeCategorySession();
  }

  if (wasBrowse && isHome) {
    resetHomeCategorySession();
    clearBrowseCategorySession();
  }

  if (wasHome && isNonStores) {
    resetHomeCategorySession();
    clearBrowseCategorySession();
  }

  if (wasBrowse && isNonStores) {
    resetHomeCategorySession();
    clearBrowseCategorySession();
  }

  if (wasNonStores && isHome) {
    resetHomeCategorySession();
    clearBrowseCategorySession();
  }

  /** DETAIL / search / other in-stack leave browse — pending only */
  if (wasBrowse && !isBrowse && !isHome && !isNonStores) {
    clearBrowseCategorySession();
  }

  if (!wasBrowse && isBrowse) {
    clearBrowseCategorySession();
  }

  /** store detail (or other in-stack) → NON-STORES */
  if (!wasHome && !wasBrowse && !wasNonStores && isNonStores) {
    resetHomeCategorySession();
    clearBrowseCategorySession();
  }
}
