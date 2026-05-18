import { touchCommerceCartSnapshot } from "@/lib/stores/store-commerce-cart-expiry";
import type {
  StoreCommerceCartLine,
  StoreCommerceCartSnapshotV2,
} from "@/lib/stores/store-commerce-cart-types";

function normalizeStoreIdKey(id: string | undefined | null): string {
  return String(id ?? "").trim();
}

export function findStoreIdForCartLine(
  snap: StoreCommerceCartSnapshotV2 | null,
  lineId: string
): string | null {
  if (!snap?.carts) return null;
  const lid = lineId.trim();
  if (!lid) return null;
  for (const bucket of Object.values(snap.carts)) {
    if (bucket.lines.some((l) => l.lineId === lid)) {
      return normalizeStoreIdKey(bucket.storeId) || bucket.storeId;
    }
  }
  return null;
}

export function mutateCartLineQuantity(
  prev: StoreCommerceCartSnapshotV2 | null,
  lineId: string,
  qty: number
): { next: StoreCommerceCartSnapshotV2 | null; storeId: string | null; deleted: boolean } {
  if (!prev) return { next: prev, storeId: null, deleted: false };
  const q = Math.floor(qty);
  const carts = { ...prev.carts };
  for (const bid of Object.keys(carts)) {
    const bucket = carts[bid];
    const hit = bucket.lines.some((l) => l.lineId === lineId);
    if (!hit) continue;
    const storeId = normalizeStoreIdKey(bucket.storeId) || bucket.storeId;
    const lines = bucket.lines
      .map((l) => {
        if (l.lineId !== lineId) return l;
        if (q <= 0) return null;
        const nq = Math.max(l.minOrderQty, Math.min(l.maxOrderQty, q));
        return { ...l, qty: nq };
      })
      .filter(Boolean) as StoreCommerceCartLine[];
    if (lines.length === 0) delete carts[bid];
    else carts[bid] = { ...bucket, lines };
    const next =
      Object.keys(carts).length === 0
        ? null
        : touchCommerceCartSnapshot({ v: 2, carts }, storeId);
    return { next, storeId, deleted: q <= 0 };
  }
  return { next: prev, storeId: null, deleted: false };
}

export function mutateCartRemoveLine(
  prev: StoreCommerceCartSnapshotV2 | null,
  lineId: string
): { next: StoreCommerceCartSnapshotV2 | null; storeId: string | null } {
  if (!prev) return { next: prev, storeId: null };
  const carts = { ...prev.carts };
  for (const bid of Object.keys(carts)) {
    const bucket = carts[bid];
    const hit = bucket.lines.some((l) => l.lineId === lineId);
    if (!hit) continue;
    const storeId = normalizeStoreIdKey(bucket.storeId) || bucket.storeId;
    const lines = bucket.lines.filter((l) => l.lineId !== lineId);
    if (lines.length === 0) delete carts[bid];
    else carts[bid] = { ...bucket, lines };
    const next =
      Object.keys(carts).length === 0
        ? null
        : touchCommerceCartSnapshot({ v: 2, carts }, storeId);
    return { next, storeId };
  }
  return { next: prev, storeId: null };
}
