import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";

export function modifierWireFromCartLine(line: StoreCommerceCartLine): ModifierSelectionsWire {
  if (line.modifierWire?.pick) {
    return {
      pick: { ...line.modifierWire.pick },
      qty: { ...(line.modifierWire.qty ?? {}) },
    };
  }
  return { pick: { ...(line.optionSelections ?? {}) }, qty: {} };
}

function normalizeCommerceProductIdKey(productId: string): string {
  return String(productId ?? "").trim().toLowerCase();
}

/** 매장 버킷에서 productId 와 일치하는 담긴 줄(수량>0) — 상품당 1줄 정책 */
export function findCommerceCartLineByProductId(
  lines: readonly StoreCommerceCartLine[],
  productId: string
): StoreCommerceCartLine | null {
  const pid = normalizeCommerceProductIdKey(productId);
  if (!pid) return null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (normalizeCommerceProductIdKey(line.productId) !== pid) continue;
    const q = Math.floor(Number(line.qty));
    if (Number.isFinite(q) && q > 0) return line;
  }
  return null;
}

export function clampCartSeedQty(
  line: StoreCommerceCartLine,
  minQ: number,
  capQty: number
): number {
  const min = Math.max(1, Math.floor(minQ) || 1);
  const cap = Math.max(min, Math.floor(capQty) || min);
  const fromLine = Math.floor(Number(line.qty));
  const q = Number.isFinite(fromLine) && fromLine > 0 ? fromLine : min;
  return Math.min(cap, Math.max(min, q));
}
