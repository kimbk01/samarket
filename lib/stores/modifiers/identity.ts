import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";

function stablePickString(pick: Record<string, string[]>): string {
  const keys = Object.keys(pick).sort();
  const o: Record<string, string[]> = {};
  for (const k of keys) {
    const arr = [...(pick[k] ?? [])].map((s) => String(s).trim()).filter(Boolean).sort();
    if (arr.length) o[k] = arr;
  }
  return JSON.stringify(o);
}

function stableQtyString(qty: Record<string, Record<string, number>>): string {
  const keys = Object.keys(qty).sort();
  const o: Record<string, Record<string, number>> = {};
  for (const gk of keys) {
    const inner = qty[gk] ?? {};
    const ik = Object.keys(inner).sort();
    const m: Record<string, number> = {};
    for (const k of ik) {
      const n = Math.floor(Number(inner[k]));
      if (Number.isFinite(n) && n > 0) m[k] = n;
    }
    if (Object.keys(m).length) o[gk] = m;
  }
  return JSON.stringify(o);
}

export function modifierLineIdentityKey(productId: string, wire: ModifierSelectionsWire): string {
  return `${productId}\tP:${stablePickString(wire.pick)}\tQ:${stableQtyString(wire.qty)}`;
}
