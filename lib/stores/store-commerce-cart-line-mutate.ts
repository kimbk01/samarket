import { wireFromLegacyPickOnly } from "@/lib/stores/product-line-options";
import {
  cloneModifierWire,
  consolidateCommerceCartBucketLines,
} from "@/lib/stores/store-commerce-cart-add-merge";
import { touchCommerceCartSnapshot } from "@/lib/stores/store-commerce-cart-expiry";
import type {
  AddStoreCartLineInput,
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

function lineFromAddInput(input: AddStoreCartLineInput, lineId: string): StoreCommerceCartLine {
  const q = Math.max(
    input.minOrderQty,
    Math.min(input.maxOrderQty, Math.floor(Number(input.qty)) || input.minOrderQty)
  );
  const wire = input.modifierWire ?? wireFromLegacyPickOnly(input.optionSelections);
  return {
    lineId,
    productId: input.productId,
    title: input.title,
    thumbnailUrl: input.thumbnailUrl,
    qty: q,
    unitPricePhp: input.unitPricePhp,
    listUnitPricePhp: input.listUnitPricePhp ?? null,
    discountPercent: input.discountPercent ?? null,
    modifierWire: cloneModifierWire(wire),
    optionSelections: { ...wire.pick },
    optionsSummary: input.optionsSummary,
    lineNote: input.lineNote?.trim() || null,
    pickupAvailable: input.pickupAvailable,
    localDeliveryAvailable: input.localDeliveryAvailable,
    shippingAvailable: input.shippingAvailable,
    minOrderQty: input.minOrderQty,
    maxOrderQty: input.maxOrderQty,
  };
}

/** 카트 줄 옵션 변경 — 동일 lineId 유지, 내용만 갱신 */
export function mutateCartReplaceLineAt(
  prev: StoreCommerceCartSnapshotV2 | null,
  lineId: string,
  input: AddStoreCartLineInput
): { next: StoreCommerceCartSnapshotV2 | null; storeId: string | null; ok: boolean } {
  if (!prev) return { next: prev, storeId: null, ok: false };
  const lid = lineId.trim();
  if (!lid) return { next: prev, storeId: null, ok: false };

  const carts = { ...prev.carts };
  for (const bid of Object.keys(carts)) {
    const bucket = carts[bid];
    const idx = bucket.lines.findIndex((l) => l.lineId === lid);
    if (idx < 0) continue;
    const storeId = normalizeStoreIdKey(bucket.storeId) || bucket.storeId;
    const lines = [...bucket.lines];
    lines[idx] = lineFromAddInput(input, lid);
    const consolidated = consolidateCommerceCartBucketLines(storeId, lines);
    carts[bid] = { ...bucket, lines: consolidated };
    const next =
      Object.keys(carts).length === 0
        ? null
        : touchCommerceCartSnapshot({ v: 2, carts }, storeId);
    return { next, storeId, ok: true };
  }
  return { next: prev, storeId: null, ok: false };
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
