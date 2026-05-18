"use client";

import type { StoreCommerceCartSnapshotV2 } from "@/lib/stores/store-commerce-cart-types";
import { snapshotGeneration } from "@/lib/stores/store-commerce-cart-sync-guard";

export type CommerceCartSnapshotBusState = {
  hydrated: boolean;
  snapshot: StoreCommerceCartSnapshotV2 | null;
  generation: number;
  cartGeneration: number;
};

let bus: CommerceCartSnapshotBusState = {
  hydrated: false,
  snapshot: null,
  generation: 0,
  cartGeneration: 0,
};

const listeners = new Set<() => void>();

export function publishCommerceCartSnapshot(
  hydrated: boolean,
  snapshot: StoreCommerceCartSnapshotV2 | null
): void {
  const snapGen = snapshotGeneration(snapshot);
  if (
    bus.hydrated === hydrated &&
    bus.snapshot === snapshot &&
    bus.cartGeneration === snapGen
  ) {
    return;
  }
  bus = {
    hydrated,
    snapshot,
    generation: bus.generation + 1,
    cartGeneration: snapGen,
  };
  for (const l of listeners) l();
}

export function subscribeCommerceCartSnapshot(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCommerceCartSnapshotBus(): CommerceCartSnapshotBusState {
  return bus;
}
