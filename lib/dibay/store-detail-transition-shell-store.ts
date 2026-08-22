"use client";

import type { StoreDetailListSeed } from "@/lib/dibay/store-detail-list-seed";

export type StoreDetailTransitionShellState = {
  seed: StoreDetailListSeed;
  href: string;
} | null;

let state: StoreDetailTransitionShellState = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeStoreDetailTransitionShell(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoreDetailTransitionShellSnapshot(): StoreDetailTransitionShellState {
  return state;
}

export function showStoreDetailTransitionShell(seed: StoreDetailListSeed, href: string): void {
  /**
   * CUT-C — delivery drill-down uses main-shell full-page `rtl-forward` / `ltr-back`.
   * Partial portal cover would double-animate with AppRouteTransition; keep API for callers
   * but do not mount overlay state.
   */
  void seed;
  void href;
  return;
}

export function hideStoreDetailTransitionShell(slug?: string): void {
  if (!state) return;
  if (slug && state.seed.slug.trim().toLowerCase() !== slug.trim().toLowerCase()) return;
  state = null;
  emit();
}

export function resetStoreDetailTransitionShellForTests(): void {
  state = null;
  emit();
}
