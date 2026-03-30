import type { ModifierInputType, ParsedModifierItem, ParsedOptionGroup } from "@/lib/stores/modifiers/types";

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return fallback;
  return Math.max(lo, Math.min(hi, x));
}

const INPUT_TYPES = new Set<ModifierInputType>(["radio", "checkbox", "select", "quantity"]);

function inferInputType(
  minSelect: number,
  maxSelect: number,
  raw: unknown
): ModifierInputType {
  const s = String(raw ?? "").trim() as ModifierInputType;
  if (INPUT_TYPES.has(s)) return s;
  if (maxSelect <= 1) return "radio";
  return "checkbox";
}

function stableItemKey(groupIndex: number, optIndex: number, explicit?: unknown): string {
  const id = explicit != null ? String(explicit).trim() : "";
  if (id && /^[a-zA-Z0-9_-]{1,64}$/.test(id)) return id;
  return `g${groupIndex}_i${optIndex}`;
}

/** options_json 배열 → 파싱(정렬·타입 추론 포함) */
export function parseProductOptionsJson(raw: unknown): ParsedOptionGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedOptionGroup[] = [];
  for (let gi = 0; gi < raw.length; gi++) {
    const g = raw[gi];
    if (!g || typeof g !== "object") continue;
    const rec = g as Record<string, unknown>;
    const labelRaw = String(rec.nameKo ?? rec.name ?? "").trim();
    const label = labelRaw || `옵션 ${gi + 1}`;
    const description = String(rec.description ?? "").trim();
    const sortOrder = clampInt(rec.sortOrder, -9999, 9999, gi);
    const minSelect = clampInt(rec.minSelect, 0, 99, 0);
    let maxSelect = clampInt(rec.maxSelect, 0, 99, 1);
    if (maxSelect < minSelect) maxSelect = minSelect;
    const isRequired = rec.isRequired === true || rec.required === true;
    const inputType = inferInputType(minSelect, maxSelect, rec.inputType);
    const optsRaw = Array.isArray(rec.options) ? rec.options : [];
    const options: ParsedModifierItem[] = [];
    for (let oi = 0; oi < optsRaw.length; oi++) {
      const o = optsRaw[oi];
      if (!o || typeof o !== "object") continue;
      const or = o as Record<string, unknown>;
      const name = String(or.name ?? "").trim();
      if (!name) continue;
      options.push({
        key: stableItemKey(gi, oi, or.id ?? or.key),
        name,
        priceDelta: Math.floor(Number(or.priceDelta ?? 0)),
        soldOut: or.soldOut === true || or.is_sold_out === true,
        defaultSelected: or.defaultSelected === true || or.default_selected === true,
      });
    }
    if (options.length === 0) continue;
    const key = String(rec.id ?? rec.key ?? gi).trim() || String(gi);
    const templateGroupId =
      typeof rec.templateGroupId === "string" && rec.templateGroupId.trim()
        ? rec.templateGroupId.trim()
        : undefined;
    out.push({
      key,
      label,
      description,
      sortOrder,
      inputType,
      isRequired,
      minSelect,
      maxSelect,
      options,
      templateGroupId,
    });
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
  return out;
}
