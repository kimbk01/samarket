import { orderLineIdentityKey, wireFromLegacyPickOnly } from "@/lib/stores/product-line-options";
import type {
  AddStoreCartLineInput,
  StoreCartAddResult,
  StoreCommerceCartBucket,
  StoreCommerceCartLine,
  StoreCommerceCartSnapshotV2,
} from "@/lib/stores/store-commerce-cart-types";

function newLineId(): string {
  return `ln_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function lineQtyNumber(l: StoreCommerceCartLine): number {
  const x = Math.floor(Number(l.qty));
  return Number.isFinite(x) && x > 0 ? x : 0;
}

function bucketStats(b: StoreCommerceCartBucket): { itemCount: number; subtotalPhp: number } {
  const itemCount = b.lines.filter((l) => lineQtyNumber(l) > 0).length;
  const subtotalPhp = b.lines.reduce(
    (n, l) => n + Math.max(0, Number(l.unitPricePhp) || 0) * lineQtyNumber(l),
    0
  );
  return { itemCount, subtotalPhp };
}

function normalizeStoreIdKey(id: string | undefined | null): string {
  return String(id ?? "").trim();
}

function effectiveModifierWire(l: StoreCommerceCartLine) {
  return l.modifierWire ?? wireFromLegacyPickOnly(l.optionSelections);
}

export function emptyCommerceCartV2(): StoreCommerceCartSnapshotV2 {
  return { v: 2, carts: {} };
}

/**
 * 순수 함수 — 스냅샷에 줄 추가·병합. 다른 매장 버킷이 있으면 차단 결과만 반환.
 */
export function computeStoreCartAddOrMerge(
  base: StoreCommerceCartSnapshotV2,
  input: AddStoreCartLineInput
): { result: StoreCartAddResult; nextSnapshot: StoreCommerceCartSnapshotV2 | null } {
  const q = Math.max(
    input.minOrderQty,
    Math.min(input.maxOrderQty, Math.floor(Number(input.qty)) || input.minOrderQty)
  );
  const wire = input.modifierWire ?? wireFromLegacyPickOnly(input.optionSelections);
  const identity = orderLineIdentityKey(input.productId, wire);

  const newLine = (): StoreCommerceCartLine => ({
    lineId: newLineId(),
    productId: input.productId,
    title: input.title,
    thumbnailUrl: input.thumbnailUrl,
    qty: q,
    unitPricePhp: input.unitPricePhp,
    listUnitPricePhp: input.listUnitPricePhp ?? null,
    discountPercent: input.discountPercent ?? null,
    modifierWire: input.modifierWire ?? null,
    optionSelections: { ...wire.pick },
    optionsSummary: input.optionsSummary,
    lineNote: input.lineNote?.trim() || null,
    pickupAvailable: input.pickupAvailable,
    localDeliveryAvailable: input.localDeliveryAvailable,
    shippingAvailable: input.shippingAvailable,
    minOrderQty: input.minOrderQty,
    maxOrderQty: input.maxOrderQty,
  });

  const canonicId = normalizeStoreIdKey(input.storeId);

  for (const b of Object.values(base.carts)) {
    if (normalizeStoreIdKey(b.storeId) === canonicId) continue;
    if (bucketStats(b).itemCount > 0) {
      return {
        result: {
          ok: false,
          reason: "blocked_by_other_store",
          existingStoreId: normalizeStoreIdKey(b.storeId) || b.storeId,
          nextStoreId: canonicId || input.storeId,
        },
        nextSnapshot: base,
      };
    }
  }

  const cartKey =
    Object.keys(base.carts).find(
      (k) => normalizeStoreIdKey(base.carts[k]?.storeId) === canonicId
    ) ?? canonicId;
  const prevBucket = base.carts[cartKey];
  const lines = prevBucket?.lines ?? [];

  const idx = lines.findIndex(
    (l) => orderLineIdentityKey(l.productId, effectiveModifierWire(l)) === identity
  );
  let nextLines: StoreCommerceCartLine[];
  let reason: "added" | "merged" = "added";
  if (idx >= 0) {
    reason = "merged";
    const cur = lines[idx];
    const curQ = lineQtyNumber(cur);
    const nq = Math.min(cur.maxOrderQty, curQ + q);
    nextLines = lines.map((l, i) =>
      i === idx
        ? {
            ...cur,
            qty: Math.max(cur.minOrderQty, nq),
            listUnitPricePhp: cur.listUnitPricePhp ?? input.listUnitPricePhp ?? null,
            discountPercent: cur.discountPercent ?? input.discountPercent ?? null,
            pickupAvailable: input.pickupAvailable ?? cur.pickupAvailable,
            localDeliveryAvailable: input.localDeliveryAvailable ?? cur.localDeliveryAvailable,
            shippingAvailable: input.shippingAvailable ?? cur.shippingAvailable,
          }
        : l
    );
  } else {
    nextLines = [...lines, newLine()];
  }

  const nextBucket: StoreCommerceCartBucket = {
    storeId: canonicId || input.storeId,
    storeSlug: input.storeSlug,
    storeName: input.storeName,
    lines: nextLines,
  };

  const nextSnapshot: StoreCommerceCartSnapshotV2 = {
    v: 2,
    carts: { ...base.carts, [cartKey]: nextBucket },
  };

  return { result: { ok: true, reason }, nextSnapshot };
}
