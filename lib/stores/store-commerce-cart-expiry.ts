import { emptyCommerceCartV2 } from "@/lib/stores/store-commerce-cart-add-merge";
import { storeCartTtlMs } from "@/lib/stores/store-cart-policy";
import { withBumpedGeneration } from "@/lib/stores/store-commerce-cart-sync-guard";
import type {
  StoreCommerceCartBucket,
  StoreCommerceCartSnapshotV2,
} from "@/lib/stores/store-commerce-cart-types";

function lineQtyNumber(qty: unknown): number {
  const x = Math.floor(Number(qty));
  return Number.isFinite(x) && x > 0 ? x : 0;
}

function bucketItemCount(b: StoreCommerceCartBucket): number {
  return (b.lines ?? []).filter((l) => lineQtyNumber(l.qty) > 0).length;
}

function snapshotHasActiveLines(snap: StoreCommerceCartSnapshotV2): boolean {
  return Object.values(snap.carts ?? {}).some((b) => bucketItemCount(b) > 0);
}

/** 구버전(touchedAtMs 없음) — 즉시 삭제 대신 TTL 기준점 부여 */
export function migrateLegacyCommerceCartSnapshot(
  snap: StoreCommerceCartSnapshotV2
): StoreCommerceCartSnapshotV2 {
  if (snap.touchedAtMs != null && Number.isFinite(snap.touchedAtMs)) return snap;
  if (!snapshotHasActiveLines(snap)) return snap;
  const now = Date.now();
  return {
    ...snap,
    touchedAtMs: now,
    generation: snap.generation ?? now,
  };
}

function normalizeStoreIdKey(id: string | undefined | null): string {
  return String(id ?? "").trim();
}

export function touchCommerceCartSnapshot(
  snap: StoreCommerceCartSnapshotV2,
  storeId?: string
): StoreCommerceCartSnapshotV2 {
  const now = Date.now();
  const tid = storeId ? normalizeStoreIdKey(storeId) : "";
  const carts: Record<string, StoreCommerceCartBucket> = {};
  for (const [k, b] of Object.entries(snap.carts ?? {})) {
    const match = tid && normalizeStoreIdKey(b.storeId) === tid;
    carts[k] = match ? { ...b, touchedAtMs: now } : { ...b };
  }
  return withBumpedGeneration({ ...snap, v: 2, carts, touchedAtMs: now });
}

/** 활성(비어 있지 않은) 버킷이 2개 이상이면 가장 최근 1개만 유지 */
export function enforceSingleActiveStoreCart(
  snap: StoreCommerceCartSnapshotV2
): { snapshot: StoreCommerceCartSnapshotV2; droppedOtherStores: boolean } {
  const nonempty = Object.entries(snap.carts ?? {}).filter(([, b]) => bucketItemCount(b) > 0);
  if (nonempty.length <= 1) {
    return { snapshot: snap, droppedOtherStores: false };
  }
  const sorted = [...nonempty].sort(
    (a, b) => (b[1].touchedAtMs ?? snap.touchedAtMs ?? 0) - (a[1].touchedAtMs ?? snap.touchedAtMs ?? 0)
  );
  const [keepKey, keepBucket] = sorted[0]!;
  const canonicalKey = normalizeStoreIdKey(keepBucket.storeId) || keepKey;
  return {
    snapshot: {
      v: 2,
      touchedAtMs: keepBucket.touchedAtMs ?? snap.touchedAtMs ?? Date.now(),
      carts: {
        [canonicalKey]: { ...keepBucket, storeId: normalizeStoreIdKey(keepBucket.storeId) || keepBucket.storeId },
      },
    },
    droppedOtherStores: true,
  };
}

export function isCommerceCartSnapshotExpired(snap: StoreCommerceCartSnapshotV2 | null): boolean {
  if (!snap?.carts || Object.keys(snap.carts).length === 0) return false;
  const touched = snap.touchedAtMs;
  if (touched == null || !Number.isFinite(touched)) return false;
  return Date.now() - touched > storeCartTtlMs();
}

/** localStorage 로드 직후 — TTL·단일 매장 정리 */
export function sanitizeCommerceCartSnapshot(
  raw: StoreCommerceCartSnapshotV2 | null
): { snapshot: StoreCommerceCartSnapshotV2 | null; expired: boolean; droppedOtherStores: boolean } {
  if (!raw?.carts) return { snapshot: null, expired: false, droppedOtherStores: false };
  const migrated = migrateLegacyCommerceCartSnapshot(raw);
  if (isCommerceCartSnapshotExpired(migrated)) {
    return { snapshot: null, expired: true, droppedOtherStores: false };
  }
  const single = enforceSingleActiveStoreCart(migrated);
  return {
    snapshot: single.snapshot,
    expired: false,
    droppedOtherStores: single.droppedOtherStores,
  };
}

export function emptyExpiredCommerceCart(): StoreCommerceCartSnapshotV2 {
  return emptyCommerceCartV2();
}
