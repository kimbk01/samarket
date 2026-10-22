import { wireFromLegacyPickOnly } from "@/lib/stores/product-line-options";
import {
  cloneModifierWire,
  consolidateCommerceCartBucketLines,
} from "@/lib/stores/store-commerce-cart-add-merge";
import { touchCommerceCartSnapshot } from "@/lib/stores/store-commerce-cart-expiry";
import type {
  AddStoreCartLineInput,
  StoreCartLineRevalidationPatch,
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

function revalidatedPriceFields(
  line: StoreCommerceCartLine,
  patch: StoreCartLineRevalidationPatch
): Pick<StoreCommerceCartLine, "unitPricePhp" | "listUnitPricePhp" | "discountPercent"> {
  const unitRaw = patch.unitPricePhp;
  if (unitRaw == null || !Number.isFinite(Number(unitRaw))) {
    return {
      unitPricePhp: line.unitPricePhp,
      listUnitPricePhp: line.listUnitPricePhp ?? null,
      discountPercent: line.discountPercent ?? null,
    };
  }
  const unit = Math.max(0, Math.floor(Number(unitRaw)));
  const listRaw = patch.listUnitPricePhp;
  const list =
    listRaw != null && Number.isFinite(Number(listRaw)) ? Math.max(0, Math.floor(Number(listRaw))) : null;
  if (list == null || list <= unit) {
    return { unitPricePhp: unit, listUnitPricePhp: null, discountPercent: null };
  }
  const pct = Math.max(0, Math.min(99, Math.round((1 - unit / list) * 100)));
  return { unitPricePhp: unit, listUnitPricePhp: list, discountPercent: pct > 0 ? pct : null };
}

/**
 * CRT-02 — 서버 재검증 결과 반영: 단가 갱신 + 주문 불가 사유 표시/해제.
 * 바뀐 것이 없으면 `prev` 를 그대로 돌려준다(재렌더·저장 루프 방지).
 */
export function mutateCartApplyRevalidation(
  prev: StoreCommerceCartSnapshotV2 | null,
  storeId: string,
  patches: readonly StoreCartLineRevalidationPatch[]
): { next: StoreCommerceCartSnapshotV2 | null; changed: boolean } {
  if (!prev || patches.length === 0) return { next: prev, changed: false };
  const tid = normalizeStoreIdKey(storeId);
  if (!tid) return { next: prev, changed: false };
  const byLineId = new Map(patches.map((p) => [p.lineId, p]));
  let changed = false;
  const carts = { ...prev.carts };
  for (const bid of Object.keys(carts)) {
    const bucket = carts[bid];
    if (!bucket || normalizeStoreIdKey(bucket.storeId) !== tid) continue;
    let bucketChanged = false;
    const lines = bucket.lines.map((l) => {
      const patch = byLineId.get(l.lineId);
      if (!patch) return l;
      const price = revalidatedPriceFields(l, patch);
      const issue = patch.issue?.trim() || null;
      if (
        price.unitPricePhp === l.unitPricePhp &&
        (price.listUnitPricePhp ?? null) === (l.listUnitPricePhp ?? null) &&
        (price.discountPercent ?? null) === (l.discountPercent ?? null) &&
        issue === (l.revalidationIssue ?? null)
      ) {
        return l;
      }
      bucketChanged = true;
      return { ...l, ...price, revalidationIssue: issue };
    });
    if (!bucketChanged) continue;
    changed = true;
    carts[bid] = { ...bucket, lines };
  }
  if (!changed) return { next: prev, changed: false };
  return { next: touchCommerceCartSnapshot({ v: 2, carts }, tid), changed: true };
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
