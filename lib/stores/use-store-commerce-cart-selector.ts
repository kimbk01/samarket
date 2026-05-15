"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getCommerceCartSnapshotBus,
  subscribeCommerceCartSnapshot,
} from "@/lib/stores/store-commerce-cart-snapshot-bus";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";

function normalizeStoreIdKey(id: string | undefined | null): string {
  return String(id ?? "").trim();
}

function lineQtyNumber(l: StoreCommerceCartLine): number {
  const x = Math.floor(Number(l.qty));
  return Number.isFinite(x) && x > 0 ? x : 0;
}

export type StoreCommerceCartBucketStats = {
  hydrated: boolean;
  itemCount: number;
  subtotalPhp: number;
  totalQty: number;
};

const EMPTY: StoreCommerceCartBucketStats = {
  hydrated: false,
  itemCount: 0,
  subtotalPhp: 0,
  totalQty: 0,
};

type StatsCache = {
  generation: number;
  storeId: string;
  stats: StoreCommerceCartBucketStats;
};

let statsCache: StatsCache | null = null;

function computeBucketStats(storeId: string): StoreCommerceCartBucketStats {
  const bus = getCommerceCartSnapshotBus();
  const tid = normalizeStoreIdKey(storeId);
  if (!bus.hydrated || !tid || !bus.snapshot?.carts) {
    return { ...EMPTY, hydrated: bus.hydrated };
  }
  const buckets = Object.values(bus.snapshot.carts).filter(
    (b) => normalizeStoreIdKey(b.storeId) === tid
  );
  if (buckets.length === 0) {
    return { hydrated: true, itemCount: 0, subtotalPhp: 0, totalQty: 0 };
  }
  let itemCount = 0;
  let subtotalPhp = 0;
  let totalQty = 0;
  for (const b of buckets) {
    for (const l of b.lines) {
      const q = lineQtyNumber(l);
      if (q <= 0) continue;
      itemCount += 1;
      subtotalPhp += Math.max(0, Number(l.unitPricePhp) || 0) * q;
      totalQty += q;
    }
  }
  return { hydrated: true, itemCount, subtotalPhp, totalQty };
}

function readBucketStats(storeId: string): StoreCommerceCartBucketStats {
  const bus = getCommerceCartSnapshotBus();
  if (
    statsCache &&
    statsCache.generation === bus.generation &&
    statsCache.storeId === storeId
  ) {
    return statsCache.stats;
  }
  const stats = computeBucketStats(storeId);
  statsCache = { generation: bus.generation, storeId, stats };
  return stats;
}

export function useStoreCommerceCartBucketStats(
  storeId: string | null | undefined
): StoreCommerceCartBucketStats {
  const sid = useMemo(() => normalizeStoreIdKey(storeId), [storeId]);
  return useSyncExternalStore(
    subscribeCommerceCartSnapshot,
    () => (sid ? readBucketStats(sid) : EMPTY),
    () => EMPTY
  );
}

export function useStoreCommerceCartLines(storeId: string | null | undefined): StoreCommerceCartLine[] {
  const sid = useMemo(() => normalizeStoreIdKey(storeId), [storeId]);
  return useSyncExternalStore(
    subscribeCommerceCartSnapshot,
    () => {
      const bus = getCommerceCartSnapshotBus();
      if (!bus.hydrated || !sid || !bus.snapshot?.carts) return [];
      return Object.values(bus.snapshot.carts)
        .filter((b) => normalizeStoreIdKey(b.storeId) === sid)
        .flatMap((b) => b.lines);
    },
    () => []
  );
}

export function useStoreCommerceCartHeaderBadgeCount(
  commerceCartStoreId: string | null | undefined
): number {
  const sid = useMemo(() => normalizeStoreIdKey(commerceCartStoreId), [commerceCartStoreId]);
  return useSyncExternalStore(
    subscribeCommerceCartSnapshot,
    () => {
      const bus = getCommerceCartSnapshotBus();
      if (!bus.hydrated) return 0;
      if (sid) return readBucketStats(sid).itemCount;
      if (!bus.snapshot?.carts) return 0;
      return Object.values(bus.snapshot.carts).reduce((n, b) => {
        const lines = b.lines.filter((l) => lineQtyNumber(l) > 0);
        return n + lines.length;
      }, 0);
    },
    () => 0
  );
}
