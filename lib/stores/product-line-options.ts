import { formatMoneyPhp } from "@/lib/utils/format";

export type ParsedOptionGroup = {
  key: string;
  label: string;
  minSelect: number;
  maxSelect: number;
  options: { name: string; priceDelta: number }[];
};

export type OrderLineOptionsSnapshotV1 = {
  v: 1;
  summary: string;
  unit_options_delta: number;
  groups: { key: string; label: string; names: string[]; delta: number }[];
};

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return fallback;
  return Math.max(lo, Math.min(hi, x));
}

/** 매장 상품 options_json → 검증·UI용 그룹 (원본 배열 인덱스를 key 로 유지) */
export function parseProductOptionsJson(raw: unknown): ParsedOptionGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedOptionGroup[] = [];
  for (let i = 0; i < raw.length; i++) {
    const g = raw[i];
    if (!g || typeof g !== "object") continue;
    const rec = g as Record<string, unknown>;
    const labelRaw = String(rec.nameKo ?? rec.name ?? "").trim();
    const label = labelRaw || `옵션 ${i + 1}`;
    const minSelect = clampInt(rec.minSelect, 0, 99, 0);
    let maxSelect = clampInt(rec.maxSelect, 0, 99, 1);
    if (maxSelect < minSelect) maxSelect = minSelect;
    const optsRaw = Array.isArray(rec.options) ? rec.options : [];
    const options: { name: string; priceDelta: number }[] = [];
    for (const o of optsRaw) {
      if (!o || typeof o !== "object") continue;
      const or = o as Record<string, unknown>;
      const name = String(or.name ?? "").trim();
      if (!name) continue;
      options.push({
        name,
        priceDelta: Math.max(0, Math.floor(Number(or.priceDelta ?? 0))),
      });
    }
    if (options.length === 0) continue;
    out.push({ key: String(i), label, minSelect, maxSelect, options });
  }
  return out;
}

export function stableOptionSelectionsKey(selections: Record<string, string[]> | undefined): string {
  if (!selections || Object.keys(selections).length === 0) return "";
  const keys = Object.keys(selections).sort();
  const obj: Record<string, string[]> = {};
  for (const k of keys) {
    const arr = [...(selections[k] ?? [])].map((x) => String(x).trim()).filter(Boolean).sort();
    if (arr.length) obj[k] = arr;
  }
  return JSON.stringify(obj);
}

export function orderLineIdentityKey(
  productId: string,
  selections: Record<string, string[]> | undefined
): string {
  return `${productId}\t${stableOptionSelectionsKey(selections)}`;
}

export function validateLineOptionSelections(
  groups: ParsedOptionGroup[],
  selections: Record<string, string[]> | undefined
): { ok: true; unitDelta: number; snapshot: OrderLineOptionsSnapshotV1 } | { ok: false; error: string } {
  const sel = selections ?? {};

  for (const k of Object.keys(sel)) {
    const vals = (sel[k] ?? []).map((x) => String(x).trim()).filter(Boolean);
    if (vals.length === 0) continue;
    if (!groups.some((g) => g.key === k)) {
      return { ok: false, error: "options_unknown_group" };
    }
  }

  if (groups.length === 0) {
    const anyPicked = Object.values(sel).some((arr) => (arr ?? []).some((x) => String(x).trim()));
    if (anyPicked) return { ok: false, error: "options_not_configured" };
    return {
      ok: true,
      unitDelta: 0,
      snapshot: { v: 1, summary: "", unit_options_delta: 0, groups: [] },
    };
  }

  const snapGroups: OrderLineOptionsSnapshotV1["groups"] = [];
  let unitDelta = 0;

  for (const g of groups) {
    const picked = (sel[g.key] ?? []).map((x) => String(x).trim()).filter(Boolean);
    if (new Set(picked).size !== picked.length) {
      return { ok: false, error: "options_duplicate_choice" };
    }
    if (picked.length < g.minSelect) {
      return { ok: false, error: "options_too_few" };
    }
    if (picked.length > g.maxSelect) {
      return { ok: false, error: "options_too_many" };
    }
    const byName = new Map(g.options.map((o) => [o.name, o.priceDelta] as const));
    let gDelta = 0;
    const names: string[] = [];
    for (const n of picked) {
      if (!byName.has(n)) return { ok: false, error: "options_invalid_choice" };
      gDelta += byName.get(n) ?? 0;
      names.push(n);
    }
    unitDelta += gDelta;
    if (names.length > 0) {
      snapGroups.push({
        key: g.key,
        label: g.label,
        names,
        delta: gDelta,
      });
    }
  }

  const summary = snapGroups
    .map((x) => {
      const d = x.delta > 0 ? ` (+${formatMoneyPhp(x.delta)})` : "";
      return `${x.label}: ${x.names.join(", ")}${d}`;
    })
    .join(" · ");

  return {
    ok: true,
    unitDelta,
    snapshot: { v: 1, summary, unit_options_delta: unitDelta, groups: snapGroups },
  };
}

/** UI·목록용 요약 한 줄 */
export function orderLineOptionsSummary(snapshot: unknown): string {
  if (snapshot == null) return "";
  if (typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot)) {
    const s = (snapshot as { summary?: unknown }).summary;
    if (typeof s === "string" && s.trim()) return s.trim();
  }
  return "";
}
