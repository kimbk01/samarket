"use client";

import { storesBrowseNavSubSlug } from "@/components/stores/browse/stores-browse-paths";

/**
 * browse 헤더 2차 칩 — pathname + ?sub settled 시 URL wins.
 * pending navigation 동안만 transient highlight·목록 쿼리.
 */

export type BrowseSubPendingNav = {
  primarySlug: string;
  targetSub: string;
};

let pendingSubNav: BrowseSubPendingNav | null = null;
let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  listeners.forEach((l) => l());
}

export function beginBrowseSubPendingNav(primarySlug: string, subSlug: string): void {
  const primary = primarySlug.trim().toLowerCase();
  const targetSub = storesBrowseNavSubSlug(subSlug);
  if (!primary || !targetSub) return;
  pendingSubNav = { primarySlug: primary, targetSub };
  bump();
}

export function clearBrowseSubPendingNav(): void {
  if (!pendingSubNav) return;
  pendingSubNav = null;
  bump();
}

export function getBrowseSubPendingNavSnapshot(): BrowseSubPendingNav | null {
  return pendingSubNav;
}

export function subscribeBrowseSubPendingNav(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBrowseSubPendingNavServerSnapshot(): BrowseSubPendingNav | null {
  return null;
}

export function syncBrowseSubNavSettled(
  pathnamePrimary: string | null,
  trimmedSubParam: string
): void {
  if (!pendingSubNav || !pathnamePrimary) return;
  const path = pathnamePrimary.trim().toLowerCase();
  const sub = trimmedSubParam.trim().toLowerCase();
  if (path === pendingSubNav.primarySlug && sub === pendingSubNav.targetSub) {
    clearBrowseSubPendingNav();
  }
}

/** 2차 칩 재탭 등 — 목록 강제 refetch (헤더 ↔ 본문 경량 신호) */
let listRefreshTick = 0;
const listRefreshListeners = new Set<() => void>();

export function bumpBrowseListRefresh(): void {
  listRefreshTick += 1;
  listRefreshListeners.forEach((l) => l());
}

export function subscribeBrowseListRefresh(listener: () => void): () => void {
  listRefreshListeners.add(listener);
  return () => listRefreshListeners.delete(listener);
}

export function getBrowseListRefreshSnapshot(): number {
  return listRefreshTick;
}

export function getBrowseListRefreshServerSnapshot(): number {
  return 0;
}

/** @internal vitest */
export function resetBrowseSubPendingNavForTests(): void {
  pendingSubNav = null;
  version = 0;
  listeners.clear();
  listRefreshTick = 0;
  listRefreshListeners.clear();
}
