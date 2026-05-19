"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getCommerceCartSnapshotBus,
  subscribeCommerceCartSnapshot,
} from "@/lib/stores/store-commerce-cart-snapshot-bus";
import { commerceCartLineSubtotalPhp } from "@/lib/stores/store-commerce-cart-add-merge";
import { findCommerceCartBucketBySlug } from "@/lib/stores/find-commerce-cart-bucket-by-slug";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";

function normalizeStoreIdKey(id: string | undefined | null): string {
  return String(id ?? "").trim();
}

function normalizeStoreSlugKey(slug: string | undefined | null): string {
  return String(slug ?? "").trim().toLowerCase();
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

const EMPTY_HYDRATED_STATS: StoreCommerceCartBucketStats = {
  hydrated: true,
  itemCount: 0,
  subtotalPhp: 0,
  totalQty: 0,
};

const EMPTY_LINES: StoreCommerceCartLine[] = [];

type StatsCache = {
  generation: number;
  storeId: string;
  stats: StoreCommerceCartBucketStats;
};

type LinesCache = {
  generation: number;
  storeId: string;
  lines: StoreCommerceCartLine[];
};

type SlugLinesCache = {
  generation: number;
  storeSlug: string;
  lines: StoreCommerceCartLine[];
};

let statsCache: StatsCache | null = null;
let linesCache: LinesCache | null = null;
let slugLinesCache: SlugLinesCache | null = null;

function computeBucketStats(storeId: string): StoreCommerceCartBucketStats {
  const bus = getCommerceCartSnapshotBus();
  const tid = normalizeStoreIdKey(storeId);
  if (!bus.hydrated || !tid || !bus.snapshot?.carts) {
    return bus.hydrated ? EMPTY_HYDRATED_STATS : EMPTY;
  }
  const buckets = Object.values(bus.snapshot.carts).filter(
    (b) => normalizeStoreIdKey(b.storeId) === tid
  );
  if (buckets.length === 0) {
    return EMPTY_HYDRATED_STATS;
  }
  let itemCount = 0;
  let subtotalPhp = 0;
  let totalQty = 0;
  for (const b of buckets) {
    for (const l of b.lines) {
      const q = lineQtyNumber(l);
      if (q <= 0) continue;
      itemCount += 1;
      subtotalPhp += commerceCartLineSubtotalPhp(l);
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

function readCartLines(storeId: string): StoreCommerceCartLine[] {
  const bus = getCommerceCartSnapshotBus();
  if (
    linesCache &&
    linesCache.generation === bus.generation &&
    linesCache.storeId === storeId
  ) {
    return linesCache.lines;
  }
  const tid = normalizeStoreIdKey(storeId);
  if (!bus.hydrated || !tid || !bus.snapshot?.carts) {
    linesCache = { generation: bus.generation, storeId, lines: EMPTY_LINES };
    return EMPTY_LINES;
  }
  const lines = Object.values(bus.snapshot.carts)
    .filter((b) => normalizeStoreIdKey(b.storeId) === tid)
    .flatMap((b) => b.lines);
  linesCache = { generation: bus.generation, storeId, lines };
  return lines;
}

function readCartLinesBySlug(storeSlug: string): StoreCommerceCartLine[] {
  const bus = getCommerceCartSnapshotBus();
  const sk = normalizeStoreSlugKey(storeSlug);
  if (
    slugLinesCache &&
    slugLinesCache.generation === bus.generation &&
    slugLinesCache.storeSlug === sk
  ) {
    return slugLinesCache.lines;
  }
  if (!bus.hydrated || !sk || !bus.snapshot?.carts) {
    slugLinesCache = { generation: bus.generation, storeSlug: sk, lines: EMPTY_LINES };
    return EMPTY_LINES;
  }
  const bucket = findCommerceCartBucketBySlug(bus.snapshot, sk);
  const lines = bucket?.lines ?? EMPTY_LINES;
  slugLinesCache = { generation: bus.generation, storeSlug: sk, lines };
  return lines;
}

/** vitest — 셀렉터 모듈 캐시 초기화 */
export function resetStoreCommerceCartSelectorCachesForTests(): void {
  statsCache = null;
  linesCache = null;
  slugLinesCache = null;
}

/** @internal useSyncExternalStore getSnapshot과 동일 경로 — 참조 안정성 테스트 */
export function readStoreCommerceCartLinesForSnapshot(storeId: string): StoreCommerceCartLine[] {
  return readCartLines(storeId);
}

/** @internal useSyncExternalStore getSnapshot과 동일 경로 — 참조 안정성 테스트 */
export function readStoreCommerceCartBucketStatsForSnapshot(
  storeId: string
): StoreCommerceCartBucketStats {
  return readBucketStats(storeId);
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
    () => (sid ? readCartLines(sid) : EMPTY_LINES),
    () => EMPTY_LINES
  );
}

/** URL slug 기준 — API store.id 로드 전에도 카트 줄 조회 */
export function useStoreCommerceCartLinesBySlug(
  storeSlug: string | null | undefined
): StoreCommerceCartLine[] {
  const sk = useMemo(() => normalizeStoreSlugKey(storeSlug), [storeSlug]);
  return useSyncExternalStore(
    subscribeCommerceCartSnapshot,
    () => (sk ? readCartLinesBySlug(sk) : EMPTY_LINES),
    () => EMPTY_LINES
  );
}

export function useStoreCommerceCartHydrated(): boolean {
  return useSyncExternalStore(
    subscribeCommerceCartSnapshot,
    () => getCommerceCartSnapshotBus().hydrated,
    () => false
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
