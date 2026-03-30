import { formatMoneyPhp } from "@/lib/utils/format";
import { modifierLineIdentityKey } from "@/lib/stores/modifiers/identity";
import { parseProductOptionsJson as parseProductOptionsJsonImpl } from "@/lib/stores/modifiers/parse-json";
import type {
  ModifierSelectionsWire,
  OrderLineOptionsSnapshotV1,
  OrderLineOptionsSnapshotV2,
  ParsedOptionGroup,
} from "@/lib/stores/modifiers/types";
import {
  emptyModifierWire,
  parseModifierWireFromBody,
  validateLineModifiers,
  wireFromLegacyPickOnly,
} from "@/lib/stores/modifiers/validate";

export type {
  ModifierInputType,
  ModifierSelectionsWire,
  ParsedModifierItem,
  ParsedOptionGroup,
  OrderLineOptionsSnapshotV1,
  OrderLineOptionsSnapshotV2,
} from "@/lib/stores/modifiers/types";

export { emptyModifierWire, parseModifierWireFromBody, validateLineModifiers, wireFromLegacyPickOnly };

export function parseProductOptionsJson(raw: unknown): ParsedOptionGroup[] {
  return parseProductOptionsJsonImpl(raw);
}

function isModifierWire(x: unknown): x is ModifierSelectionsWire {
  return !!x && typeof x === "object" && "pick" in x && "qty" in x;
}

/** 장바구니·주문 라인 동일성 (옵션 조합이 다르면 다른 줄) */
export function orderLineIdentityKey(
  productId: string,
  selections: Record<string, string[]> | ModifierSelectionsWire
): string {
  const wire: ModifierSelectionsWire = isModifierWire(selections)
    ? selections
    : wireFromLegacyPickOnly(selections);
  return modifierLineIdentityKey(productId, wire);
}

export function stableOptionSelectionsKey(selections: Record<string, string[]> | undefined): string {
  return stablePickOnlyKey(selections);
}

function stablePickOnlyKey(selections: Record<string, string[]> | undefined): string {
  const wire = wireFromLegacyPickOnly(selections);
  return `P:${JSON.stringify(wire.pick)}`;
}

/**
 * 레거시 호출: pick 만. baseUnitAfterDiscount 필수(옵션 스냅샷 v2).
 * 수량형까지 쓰려면 validateModifierSelection + modifierWire 사용.
 */
export function validateLineOptionSelections(
  groups: ParsedOptionGroup[],
  selections: Record<string, string[]> | undefined,
  baseUnitAfterDiscount: number
):
  | { ok: true; unitDelta: number; snapshot: OrderLineOptionsSnapshotV2 }
  | { ok: false; error: string } {
  return validateLineModifiers(groups, wireFromLegacyPickOnly(selections), baseUnitAfterDiscount);
}

export function validateModifierSelection(
  groups: ParsedOptionGroup[],
  wire: ModifierSelectionsWire,
  baseUnitAfterDiscount: number
):
  | { ok: true; unitDelta: number; snapshot: OrderLineOptionsSnapshotV2 }
  | { ok: false; error: string } {
  return validateLineModifiers(groups, wire, baseUnitAfterDiscount);
}

/** UI·목록용 요약 한 줄 */
export function orderLineOptionsSummary(snapshot: unknown): string {
  if (snapshot == null) return "";
  if (typeof snapshot === "object" && snapshot !== null) {
    const s = snapshot as Record<string, unknown>;
    const ver = s.v;
    const ln = typeof s.line_note === "string" ? s.line_note.trim() : "";
    let base = "";
    if ((ver === 1 || ver === 2) && typeof s.summary === "string" && s.summary.trim()) {
      base = s.summary.trim();
    } else {
      const sum = s.summary;
      if (typeof sum === "string" && sum.trim()) base = sum.trim();
    }
    if (ln && base) return `${base} · 메모: ${ln}`;
    if (ln) return `메모: ${ln}`;
    return base;
  }
  return "";
}

/** 주방·조리용: 금액 없이 옵션명 나열 */
export function orderLineOptionsKitchenLines(snapshot: unknown): string[] {
  if (snapshot == null || typeof snapshot !== "object") return [];
  const s = snapshot as Record<string, unknown>;
  if (s.v === 1) {
    const groups = s.groups;
    if (!Array.isArray(groups)) return [];
    const lines: string[] = [];
    for (const g of groups) {
      if (!g || typeof g !== "object") continue;
      const names = (g as { names?: unknown }).names;
      if (!Array.isArray(names)) continue;
      for (const n of names) lines.push(String(n));
    }
    return lines;
  }
  if (s.v !== 2) return [];
  const groups = s.groups;
  if (!Array.isArray(groups)) return [];
  const lines: string[] = [];
  for (const g of groups) {
    if (!g || typeof g !== "object") continue;
    const gr = g as Record<string, unknown>;
    const label = typeof gr.label === "string" ? gr.label : "";
    const glines = gr.lines;
    if (!Array.isArray(glines)) continue;
    for (const ln of glines) {
      if (!ln || typeof ln !== "object") continue;
      const l = ln as Record<string, unknown>;
      const name = String(l.name ?? "");
      const qty = Math.floor(Number(l.qty) || 0);
      if (!name) continue;
      lines.push(qty > 1 ? `${name} ×${qty}` : name);
    }
    if (label && lines.length) {
      /* 라벨은 첫 줄에만 접두 가능 — 여기서는 플랫 리스트 */
    }
  }
  return lines;
}

/** 고객·사장님 상세: 옵션별 줄 텍스트 (+금액) */
export function orderLineOptionsDetailLines(snapshot: unknown): { title: string; amount: string }[] {
  if (snapshot == null || typeof snapshot !== "object") return [];
  const s = snapshot as Record<string, unknown>;
  if (s.v !== 2) {
    const summary = orderLineOptionsSummary(snapshot);
    return summary ? [{ title: summary, amount: "" }] : [];
  }
  const groups = s.groups;
  if (!Array.isArray(groups)) return [];
  const out: { title: string; amount: string }[] = [];
  for (const g of groups) {
    if (!g || typeof g !== "object") continue;
    const gr = g as Record<string, unknown>;
    const label = String(gr.label ?? "");
    const glines = gr.lines;
    if (!Array.isArray(glines)) continue;
    for (const ln of glines) {
      if (!ln || typeof ln !== "object") continue;
      const l = ln as Record<string, unknown>;
      const name = String(l.name ?? "");
      const qty = Math.floor(Number(l.qty) || 0);
      const extra = Math.floor(Number(l.line_extra) || 0);
      if (!name) continue;
      const nm = qty > 1 ? `${name} ×${qty}` : name;
      const amt = extra !== 0 ? `+${formatMoneyPhp(extra)}` : formatMoneyPhp(0);
      out.push({ title: label ? `${label}: ${nm}` : nm, amount: amt });
    }
  }
  return out;
}
