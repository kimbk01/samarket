"use client";

import type { StoreDetailListSeed } from "@/lib/dibay/store-detail-list-seed";
import { markStoreDetailShellCoverEnter } from "@/lib/dibay/store-detail-nav-intent";
import { dibayPerfOnStoreDetailPerceivedShellVisible } from "@/lib/dibay/delivery-flow-perf";
import { deliveryShellEntryMark } from "@/lib/dibay/delivery-shell-entry-trace";

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
  if (typeof window === "undefined") return;
  state = { seed, href };
  markStoreDetailShellCoverEnter();
  emit();
  dibayPerfOnStoreDetailPerceivedShellVisible({ slug: seed.slug });
  deliveryShellEntryMark("shell_perceived_visible", {
    slug: seed.slug,
    href,
    seed_saved: true,
    source: "transition_overlay",
  });
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
