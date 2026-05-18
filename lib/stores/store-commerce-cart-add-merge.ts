import {
  computeCommerceCartProductMergeKey,
  wireFromLegacyPickOnly,
} from "@/lib/stores/product-line-options";
import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import { touchCommerceCartSnapshot } from "@/lib/stores/store-commerce-cart-expiry";
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

/** 카트·체크아웃 공통 — 줄 금액 = 단가 × 수량 */
export function commerceCartLineSubtotalPhp(line: StoreCommerceCartLine): number {
  return Math.max(0, Math.floor(Number(line.unitPricePhp) || 0)) * lineQtyNumber(line);
}

function bucketStats(b: StoreCommerceCartBucket): { itemCount: number; subtotalPhp: number } {
  const itemCount = b.lines.filter((l) => lineQtyNumber(l) > 0).length;
  const subtotalPhp = b.lines.reduce((n, l) => n + commerceCartLineSubtotalPhp(l), 0);
  return { itemCount, subtotalPhp };
}

function normalizeStoreIdKey(id: string | undefined | null): string {
  return String(id ?? "").trim();
}

function effectiveModifierWire(l: StoreCommerceCartLine): ModifierSelectionsWire {
  return l.modifierWire ?? wireFromLegacyPickOnly(l.optionSelections);
}

export function cloneModifierWire(wire: ModifierSelectionsWire): ModifierSelectionsWire {
  const pick: Record<string, string[]> = {};
  for (const [k, arr] of Object.entries(wire.pick ?? {})) {
    pick[k] = [...arr];
  }
  const qty: Record<string, Record<string, number>> = {};
  for (const [gk, inner] of Object.entries(wire.qty ?? {})) {
    qty[gk] = { ...inner };
  }
  return { pick, qty };
}

/** pick·qty 와이어·optionSelections 정합 */
export function normalizeCommerceCartLine(line: StoreCommerceCartLine): StoreCommerceCartLine {
  const wire = cloneModifierWire(effectiveModifierWire(line));
  return {
    ...line,
    modifierWire: wire,
    optionSelections: { ...wire.pick },
  };
}

function productMergeKey(storeId: string, productId: string): string {
  return computeCommerceCartProductMergeKey(storeId, productId);
}

/** 동일 상품 중복 줄 — 나중 줄(최신 담기) 내용·수량 유지, lineId는 첫 줄 */
function mergeDuplicateProductLines(
  primary: StoreCommerceCartLine,
  latest: StoreCommerceCartLine
): StoreCommerceCartLine {
  const keptId = primary.lineId;
  const next = normalizeCommerceCartLine(latest);
  return { ...next, lineId: keptId };
}

/**
 * 버킷 내 상품당 1줄. 중복 productId는 최신 줄로 덮고 수량 합산하지 않음.
 */
export function consolidateCommerceCartBucketLines(
  storeId: string,
  lines: StoreCommerceCartLine[]
): StoreCommerceCartLine[] {
  const sid = String(storeId ?? "").trim();
  const order: string[] = [];
  const byKey = new Map<string, StoreCommerceCartLine>();

  for (const raw of lines) {
    if (lineQtyNumber(raw) <= 0) continue;
    const line = normalizeCommerceCartLine(raw);
    const key = productMergeKey(sid, line.productId);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, line);
      order.push(key);
    } else {
      byKey.set(key, mergeDuplicateProductLines(prev, line));
    }
  }
  return order.map((k) => byKey.get(k)!);
}

function lineFromAddInput(
  input: AddStoreCartLineInput,
  lineId: string,
  qty: number
): StoreCommerceCartLine {
  const wire = input.modifierWire ?? wireFromLegacyPickOnly(input.optionSelections);
  const q = Math.max(
    input.minOrderQty,
    Math.min(input.maxOrderQty, Math.floor(qty) || input.minOrderQty)
  );
  return {
    lineId,
    productId: input.productId,
    title: input.title,
    thumbnailUrl: input.thumbnailUrl,
    qty: q,
    unitPricePhp: Math.max(0, Math.floor(Number(input.unitPricePhp) || 0)),
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

export function emptyCommerceCartV2(): StoreCommerceCartSnapshotV2 {
  return { v: 2, carts: {} };
}

/**
 * 스냅샷에 줄 추가·병합.
 * 동일 매장·동일 productId = 한 줄; 수량 기본 set(선택 수량으로 교체, 재담기해도 5→5).
 */
export function computeStoreCartAddOrMerge(
  base: StoreCommerceCartSnapshotV2,
  input: AddStoreCartLineInput
): { result: StoreCartAddResult; nextSnapshot: StoreCommerceCartSnapshotV2 | null } {
  const q = Math.max(
    input.minOrderQty,
    Math.min(input.maxOrderQty, Math.floor(Number(input.qty)) || input.minOrderQty)
  );
  const canonicId = normalizeStoreIdKey(input.storeId);
  const sid = canonicId || input.storeId;
  const pKey = productMergeKey(sid, input.productId);
  const mergeQtyMode = input.mergeQtyMode === "increment" ? "increment" : "set";

  for (const b of Object.values(base.carts)) {
    if (normalizeStoreIdKey(b.storeId) === canonicId) continue;
    if (bucketStats(b).itemCount > 0) {
      const stats = bucketStats(b);
      return {
        result: {
          ok: false,
          reason: "blocked_by_other_store",
          existingStoreId: normalizeStoreIdKey(b.storeId) || b.storeId,
          existingStoreSlug: b.storeSlug,
          existingStoreName: b.storeName,
          existingItemCount: stats.itemCount,
          existingSubtotalPhp: stats.subtotalPhp,
          nextStoreId: sid,
        },
        nextSnapshot: base,
      };
    }
  }

  const cartKey =
    Object.keys(base.carts).find((k) => normalizeStoreIdKey(base.carts[k]?.storeId) === canonicId) ??
    canonicId;
  const prevBucket = base.carts[cartKey];
  const lines = prevBucket?.lines ?? [];

  const existing = lines.find((l) => productMergeKey(sid, l.productId) === pKey);

  let nextLines: StoreCommerceCartLine[];
  let reason: "added" | "merged" = "added";

  if (existing) {
    reason = "merged";
    const curQ = lineQtyNumber(existing);
    const nq =
      mergeQtyMode === "increment"
        ? Math.min(existing.maxOrderQty, curQ + q)
        : Math.min(existing.maxOrderQty, Math.max(existing.minOrderQty, q));
    const updated = lineFromAddInput(input, existing.lineId, nq);
    nextLines = [
      ...lines.filter((l) => productMergeKey(sid, l.productId) !== pKey),
      updated,
    ];
  } else {
    nextLines = [...lines, lineFromAddInput(input, newLineId(), q)];
  }

  const now = Date.now();
  const consolidatedLines = consolidateCommerceCartBucketLines(sid, nextLines);

  const nextBucket: StoreCommerceCartBucket = {
    storeId: sid,
    storeSlug: input.storeSlug,
    storeName: input.storeName,
    lines: consolidatedLines,
    touchedAtMs: now,
  };

  const nextSnapshot = touchCommerceCartSnapshot(
    { v: 2, carts: { ...base.carts, [cartKey]: nextBucket } },
    sid
  );

  return { result: { ok: true, reason }, nextSnapshot };
}
