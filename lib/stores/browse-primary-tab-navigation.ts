"use client";

/**
 * browse 헤더 1차 탭 — pathname settled 시 URL wins.
 * pending navigation 동안만 transient highlight.
 */

export type BrowsePrimaryPendingNav = {
  targetSlug: string;
};

let pendingPrimaryNav: BrowsePrimaryPendingNav | null = null;
let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  listeners.forEach((l) => l());
}

export function beginBrowsePrimaryPendingNav(targetSlug: string): void {
  const slug = targetSlug.trim().toLowerCase();
  if (!slug) return;
  pendingPrimaryNav = { targetSlug: slug };
  bump();
}

export function clearBrowsePrimaryPendingNav(): void {
  if (!pendingPrimaryNav) return;
  pendingPrimaryNav = null;
  bump();
}

export function subscribeBrowsePrimaryTabPendingNav(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBrowsePrimaryPendingNavSnapshot(): BrowsePrimaryPendingNav | null {
  return pendingPrimaryNav;
}

export function getBrowsePrimaryPendingNavServerSnapshot(): BrowsePrimaryPendingNav | null {
  return null;
}

export function syncBrowsePrimaryNavSettled(pathnamePrimary: string | null): void {
  if (!pendingPrimaryNav || !pathnamePrimary) return;
  if (pathnamePrimary.trim().toLowerCase() === pendingPrimaryNav.targetSlug) {
    clearBrowsePrimaryPendingNav();
  }
}

/** pathname settled → URL wins; pending 중에만 targetSlug 표시 */
export function resolveBrowsePrimaryTabActiveSlug(
  pathnamePrimary: string | null,
  pending: BrowsePrimaryPendingNav | null = pendingPrimaryNav
): string | null {
  const path = pathnamePrimary?.trim().toLowerCase() || null;
  if (pending) {
    if (path !== pending.targetSlug) {
      return pending.targetSlug;
    }
  }
  return path;
}

/** @internal vitest */
export function resetBrowsePrimaryPendingNavForTests(): void {
  pendingPrimaryNav = null;
  version = 0;
  listeners.clear();
}
