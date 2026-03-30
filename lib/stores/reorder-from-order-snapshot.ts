/**
 * 주문에 저장된 options_snapshot_json → 장바구니용 ModifierSelectionsWire 복원
 */
import type { ModifierSelectionsWire, OrderLineOptionsSnapshotV2 } from "@/lib/stores/modifiers/types";
import { wireFromLegacyPickOnly } from "@/lib/stores/modifiers/validate";

export function modifierWireFromOrderOptionsSnapshot(snapshot: unknown): ModifierSelectionsWire {
  if (!snapshot || typeof snapshot !== "object") return wireFromLegacyPickOnly({});
  const s = snapshot as Record<string, unknown>;
  const v = s.v;

  if (v === 1) {
    const groups = s.groups;
    const pick: Record<string, string[]> = {};
    if (Array.isArray(groups)) {
      for (const g of groups) {
        if (!g || typeof g !== "object") continue;
        const gr = g as Record<string, unknown>;
        const gk = String(gr.key ?? "").trim();
        const names = gr.names;
        if (!gk || !Array.isArray(names)) continue;
        const arr = names.map((x) => String(x).trim()).filter(Boolean);
        if (arr.length) pick[gk] = arr;
      }
    }
    return { pick, qty: {} };
  }

  if (v !== 2) return wireFromLegacyPickOnly({});

  const groups = s.groups as OrderLineOptionsSnapshotV2["groups"] | undefined;
  if (!Array.isArray(groups)) return { pick: {}, qty: {} };

  const pick: Record<string, string[]> = {};
  const qty: Record<string, Record<string, number>> = {};

  for (const g of groups) {
    const gKey = String(g.key ?? "").trim();
    if (!gKey) continue;
    const inputType = g.input_type;

    if (inputType === "quantity") {
      const inner: Record<string, number> = {};
      for (const ln of g.lines ?? []) {
        const ik = String(ln.item_key ?? "").trim();
        const q = Math.floor(Number(ln.qty) || 0);
        if (ik && q > 0) inner[ik] = q;
      }
      if (Object.keys(inner).length) qty[gKey] = inner;
    } else {
      const names: string[] = [];
      for (const ln of g.lines ?? []) {
        const name = String(ln.name ?? "").trim();
        const q = Math.floor(Number(ln.qty) || 0);
        if (!name || q <= 0) continue;
        for (let i = 0; i < q; i++) names.push(name);
      }
      if (names.length) pick[gKey] = names;
    }
  }

  return { pick, qty };
}

export function lineNoteFromOrderOptionsSnapshot(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const ln = (snapshot as { line_note?: unknown }).line_note;
  return typeof ln === "string" && ln.trim() ? ln.trim() : null;
}
