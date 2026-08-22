import { clearBrowsePrimaryPendingNav } from "@/lib/stores/browse-primary-tab-navigation";
import { clearBrowseSubPendingNav } from "@/lib/stores/browse-sub-chip-navigation";
import { resetBrowseSubtopicCollapseChromeForSessionExit } from "@/lib/stores/browse-subtopic-collapse-chrome";
import { resetHomeCategorySession } from "@/lib/stores/stores-home-category-chrome-store";

export function isStoresHomeSurfacePath(pathKey: string): boolean {
  const p = pathKey.split("?")[0] ?? "";
  return p === "/stores" || p === "/stores/";
}

export function isStoresBrowseSurfacePath(pathKey: string): boolean {
  const p = pathKey.split("?")[0] ?? "";
  return p === "/stores/browse" || p.startsWith("/stores/browse/");
}

export function parseBrowsePathnamePrimary(pathKey: string): string | null {
  const p = pathKey.split("?")[0] ?? "";
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
 * HOME ↔ BROWSE surface transition — 단일 lifecycle authority.
 * DeliveryPresentationShell 에서만 호출.
 */
export function applyStoresCategorySurfaceTransition(prevPathKey: string, nextPathKey: string): void {
  const wasHome = isStoresHomeSurfacePath(prevPathKey);
  const wasBrowse = isStoresBrowseSurfacePath(prevPathKey);
  const isBrowse = isStoresBrowseSurfacePath(nextPathKey);

  if (wasHome && isBrowse) {
    resetHomeCategorySession();
  }
  if (wasBrowse && !isBrowse) {
    clearBrowseCategorySession();
  }
  if (!wasBrowse && isBrowse) {
    clearBrowseCategorySession();
  }
}
