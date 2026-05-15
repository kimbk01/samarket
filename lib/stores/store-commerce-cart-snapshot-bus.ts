"use client";

import type { StoreCommerceCartSnapshotV2 } from "@/lib/stores/store-commerce-cart-types";

export type CommerceCartSnapshotBusState = {
  hydrated: boolean;
  snapshot: StoreCommerceCartSnapshotV2 | null;
  generation: number;
};

let bus: CommerceCartSnapshotBusState = {
  hydrated: false,
  snapshot: null,
  generation: 0,
};

const listeners = new Set<() => void>();

export function publishCommerceCartSnapshot(
  hydrated: boolean,
  snapshot: StoreCommerceCartSnapshotV2 | null
): void {
  bus = {
    hydrated,
    snapshot,
    generation: bus.generation + 1,
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
