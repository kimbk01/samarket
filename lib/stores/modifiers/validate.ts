import { formatMoneyPhp } from "@/lib/utils/format";
import type {
  ModifierInputType,
  ModifierSelectionsWire,
  OrderLineOptionsSnapshotV2,
  ParsedOptionGroup,
} from "@/lib/stores/modifiers/types";

function effectiveMinSelect(g: ParsedOptionGroup): number {
  if (g.isRequired) return Math.max(g.minSelect, 1);
  return g.minSelect;
}

function effectiveMaxSelect(g: ParsedOptionGroup): number {
  return Math.max(g.maxSelect, effectiveMinSelect(g));
}

function itemMap(g: ParsedOptionGroup): Map<string, (typeof g.options)[0]> {
  return new Map(g.options.map((o) => [o.key, o]));
}

export function emptyModifierWire(): ModifierSelectionsWire {
  return { pick: {}, qty: {} };
}

/** 레거시 option_selections(문자열만) → 와이어 */
export function wireFromLegacyPickOnly(pick: Record<string, string[]> | undefined): ModifierSelectionsWire {
  const p: Record<string, string[]> = {};
  if (pick) {
    for (const [k, v] of Object.entries(pick)) {
      const key = String(k).trim();
      if (!key) continue;
      const arr = (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).filter(Boolean);
      if (arr.length) p[key] = arr;
    }
  }
  return { pick: p, qty: {} };
}

/** POST 본문에서 modifier_selections | option_selections(+option_quantities) 수령 */
export function parseModifierWireFromBody(body: Record<string, unknown>): ModifierSelectionsWire {
  const ms = body.modifier_selections;
  if (ms && typeof ms === "object" && !Array.isArray(ms)) {
    const o = ms as Record<string, unknown>;
    const pickRaw = o.pick;
    const qtyRaw = o.qty;
    const pick: Record<string, string[]> = {};
    if (pickRaw && typeof pickRaw === "object" && !Array.isArray(pickRaw)) {
      for (const [k, v] of Object.entries(pickRaw as Record<string, unknown>)) {
        const key = String(k).trim();
        if (!key) continue;
        if (Array.isArray(v)) {
          pick[key] = v.map((x) => String(x).trim()).filter(Boolean);
        } else if (typeof v === "string" && v.trim()) {
          pick[key] = [v.trim()];
        }
      }
    }
    const qty: Record<string, Record<string, number>> = {};
    if (qtyRaw && typeof qtyRaw === "object" && !Array.isArray(qtyRaw)) {
      for (const [gk, gv] of Object.entries(qtyRaw as Record<string, unknown>)) {
        const gKey = String(gk).trim();
        if (!gKey || !gv || typeof gv !== "object" || Array.isArray(gv)) continue;
        const inner: Record<string, number> = {};
        for (const [ik, iv] of Object.entries(gv as Record<string, unknown>)) {
          const iKey = String(ik).trim();
          if (!iKey) continue;
          const n = Math.floor(Number(iv));
          if (Number.isFinite(n) && n > 0) inner[iKey] = n;
        }
        if (Object.keys(inner).length) qty[gKey] = inner;
      }
    }
    return { pick, qty };
  }

  const legacy = body.option_selections;
  const pick: Record<string, string[]> = {};
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
    for (const [k, v] of Object.entries(legacy as Record<string, unknown>)) {
      const key = String(k).trim();
      if (!key) continue;
      if (Array.isArray(v)) {
        pick[key] = v.map((x) => String(x).trim()).filter(Boolean);
      } else if (typeof v === "string" && v.trim()) {
        pick[key] = [v.trim()];
      }
    }
  }

  const qRaw = body.option_quantities;
  const qty: Record<string, Record<string, number>> = {};
  if (qRaw && typeof qRaw === "object" && !Array.isArray(qRaw)) {
    for (const [gk, gv] of Object.entries(qRaw as Record<string, unknown>)) {
      const gKey = String(gk).trim();
      if (!gKey || !gv || typeof gv !== "object" || Array.isArray(gv)) continue;
      const inner: Record<string, number> = {};
      for (const [ik, iv] of Object.entries(gv as Record<string, unknown>)) {
        const iKey = String(ik).trim();
        if (!iKey) continue;
        const n = Math.floor(Number(iv));
        if (Number.isFinite(n) && n > 0) inner[iKey] = n;
      }
      if (Object.keys(inner).length) qty[gKey] = inner;
    }
  }
  return { pick, qty };
}

export function validateLineModifiers(
  groups: ParsedOptionGroup[],
  wire: ModifierSelectionsWire,
  baseUnitAfterDiscount: number
):
  | { ok: true; unitDelta: number; snapshot: OrderLineOptionsSnapshotV2 }
  | { ok: false; error: string } {
  const { pick, qty } = wire;

  for (const k of Object.keys(pick)) {
    if (!groups.some((g) => g.key === k)) return { ok: false, error: "options_unknown_group" };
  }
  for (const k of Object.keys(qty)) {
    if (!groups.some((g) => g.key === k)) return { ok: false, error: "options_unknown_group" };
  }

  if (groups.length === 0) {
    const anyPick = Object.values(pick).some((a) => (a ?? []).length > 0);
    const anyQty = Object.values(qty).some((m) => Object.keys(m ?? {}).length > 0);
    if (anyPick || anyQty) return { ok: false, error: "options_not_configured" };
    return {
      ok: true,
      unitDelta: 0,
      snapshot: {
        v: 2,
        summary: "",
        base_unit_after_discount: baseUnitAfterDiscount,
        unit_options_delta: 0,
        groups: [],
      },
    };
  }

  const snapGroups: OrderLineOptionsSnapshotV2["groups"] = [];
  let unitDelta = 0;

  for (const g of groups) {
    const minS = effectiveMinSelect(g);
    const maxS = effectiveMaxSelect(g);
    const byKey = itemMap(g);

    if (g.inputType === "quantity") {
      const qmap = qty[g.key] ?? {};
      let sum = 0;
      for (const it of g.options) {
        const n = Math.floor(Number(qmap[it.key] ?? 0));
        if (!Number.isFinite(n) || n < 0) {
          return { ok: false, error: "options_invalid_quantity" };
        }
        sum += n;
      }
      if (sum < minS) return { ok: false, error: "options_too_few" };
      if (sum > maxS) return { ok: false, error: "options_too_many" };

      const lines: OrderLineOptionsSnapshotV2["groups"][0]["lines"] = [];
      let gExtra = 0;
      for (const it of g.options) {
        const n = Math.floor(Number(qmap[it.key] ?? 0));
        if (n <= 0) continue;
        if (it.soldOut) return { ok: false, error: "options_sold_out" };
        const each = it.priceDelta;
        const lineExtra = each * n;
        gExtra += lineExtra;
        lines.push({
          item_key: it.key,
          name: it.name,
          qty: n,
          price_delta_each: each,
          line_extra: lineExtra,
        });
      }
      unitDelta += gExtra;
      snapGroups.push({
        key: g.key,
        label: g.label,
        input_type: g.inputType,
        lines,
        group_extra: gExtra,
      });
      continue;
    }

    const picked = (pick[g.key] ?? []).map((x) => String(x).trim()).filter(Boolean);
    if (new Set(picked).size !== picked.length) {
      return { ok: false, error: "options_duplicate_choice" };
    }

    const isSingle = g.inputType === "radio" || g.inputType === "select" || maxS <= 1;
    if (isSingle && picked.length > 1) {
      return { ok: false, error: "options_too_many" };
    }

    if (picked.length < minS) return { ok: false, error: "options_too_few" };
    if (picked.length > maxS) return { ok: false, error: "options_too_many" };

    const lines: OrderLineOptionsSnapshotV2["groups"][0]["lines"] = [];
    let gExtra = 0;
    for (const name of picked) {
      const it = g.options.find((o) => o.name === name);
      if (!it) return { ok: false, error: "options_invalid_choice" };
      if (it.soldOut) return { ok: false, error: "options_sold_out" };
      const lineExtra = it.priceDelta;
      gExtra += lineExtra;
      lines.push({
        item_key: it.key,
        name: it.name,
        qty: 1,
        price_delta_each: it.priceDelta,
        line_extra: lineExtra,
      });
    }
    unitDelta += gExtra;
    snapGroups.push({
      key: g.key,
      label: g.label,
      input_type: g.inputType as ModifierInputType,
      lines,
      group_extra: gExtra,
    });
  }

  const summary = snapGroups
    .map((gr) => {
      const parts = gr.lines.map((ln) => {
        const price =
          ln.line_extra !== 0
            ? ` (+${formatMoneyPhp(ln.line_extra)})`
            : ln.qty > 1
              ? ` ×${ln.qty}`
              : "";
        return ln.qty > 1 ? `${ln.name} ×${ln.qty}${price}` : `${ln.name}${price}`;
      });
      return `${gr.label}: ${parts.join(", ")}`;
    })
    .filter(Boolean)
    .join(" · ");

  return {
    ok: true,
    unitDelta,
    snapshot: {
      v: 2,
      summary,
      base_unit_after_discount: baseUnitAfterDiscount,
      unit_options_delta: unitDelta,
      groups: snapGroups,
    },
  };
}
