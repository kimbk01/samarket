/** 오너 상품 폼 ↔ options_json 직렬화 */

export function newLocalOptionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export type OptionRowForm = {
  id: string;
  name: string;
  priceDelta: string;
  soldOut: boolean;
  defaultSelected: boolean;
};

export type OptionGroupForm = {
  groupLocalId: string;
  nameKo: string;
  description: string;
  sortOrder: string;
  quantityMode: boolean;
  minSelect: string;
  maxSelect: string;
  options: OptionRowForm[];
};

export function ownerOptionsClampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return fallback;
  return Math.max(lo, Math.min(hi, x));
}

export function emptyOptionRow(): OptionRowForm {
  return { id: newLocalOptionId(), name: "", priceDelta: "0", soldOut: false, defaultSelected: false };
}

export function emptyOptionGroup(): OptionGroupForm {
  return {
    groupLocalId: newLocalOptionId(),
    nameKo: "",
    description: "",
    sortOrder: "0",
    quantityMode: false,
    minSelect: "1",
    maxSelect: "1",
    options: [emptyOptionRow()],
  };
}

/** DB/API options_json 배열 → 폼 상태 */
export function optionsJsonToFormGroups(raw: unknown): OptionGroupForm[] {
  if (!Array.isArray(raw)) return [];
  const out: OptionGroupForm[] = [];
  for (let gi = 0; gi < raw.length; gi++) {
    const g = raw[gi];
    if (!g || typeof g !== "object") continue;
    const rec = g as Record<string, unknown>;
    const nameKo = String(rec.nameKo ?? rec.name ?? "").trim();
    const description = String(rec.description ?? "").trim();
    const sortOrder = String(ownerOptionsClampInt(rec.sortOrder, -9999, 9999, gi));
    const it = String(rec.inputType ?? "").trim();
    const quantityMode = it === "quantity";
    const minSelect = String(ownerOptionsClampInt(rec.minSelect, 0, 99, 0));
    let maxSelect = String(ownerOptionsClampInt(rec.maxSelect, 0, 99, 1));
    if (parseInt(maxSelect, 10) < parseInt(minSelect, 10)) maxSelect = minSelect;
    const optsRaw = Array.isArray(rec.options) ? rec.options : [];
    const options: OptionRowForm[] = optsRaw.map((o, oi) => {
      if (!o || typeof o !== "object") return emptyOptionRow();
      const or = o as Record<string, unknown>;
      const idRaw = String(or.id ?? or.key ?? "").trim();
      return {
        id: idRaw || `g${gi}_i${oi}`,
        name: String(or.name ?? "").trim(),
        priceDelta: String(Math.floor(Number(or.priceDelta ?? 0))),
        soldOut: or.soldOut === true || or.is_sold_out === true,
        defaultSelected: or.defaultSelected === true || or.default_selected === true,
      };
    });
    const gid = String(rec.id ?? rec.key ?? "").trim() || String(gi);
    out.push({
      groupLocalId: gid,
      nameKo,
      description,
      sortOrder,
      quantityMode,
      minSelect,
      maxSelect,
      options: options.length > 0 ? options : [emptyOptionRow()],
    });
  }
  return out;
}

/** 폼 상태 → API options_json */
export function formGroupsToOptionsJson(groups: OptionGroupForm[]): unknown[] {
  const out: unknown[] = [];
  for (const g of groups) {
    const nameKo = g.nameKo.trim();
    const description = g.description.trim();
    const sortOrder = ownerOptionsClampInt(parseInt(g.sortOrder, 10), -9999, 9999, 0);
    let minSelect = ownerOptionsClampInt(parseInt(g.minSelect, 10), 0, 99, 0);
    let maxSelect = ownerOptionsClampInt(parseInt(g.maxSelect, 10), 0, 99, 1);
    if (maxSelect < minSelect) maxSelect = minSelect;
    const inputType = g.quantityMode ? "quantity" : maxSelect <= 1 ? "radio" : "checkbox";
    if (g.quantityMode) {
      minSelect = ownerOptionsClampInt(minSelect, 0, 99, 0);
      maxSelect = ownerOptionsClampInt(maxSelect, minSelect, 99, Math.max(minSelect, 3));
    }
    const isRequired = minSelect >= 1;
    const options = g.options
      .map((o) => ({
        id: o.id.trim() || newLocalOptionId(),
        name: o.name.trim(),
        priceDelta: Math.floor(parseInt(o.priceDelta, 10) || 0),
        soldOut: o.soldOut === true,
        defaultSelected: o.defaultSelected === true,
      }))
      .filter((o) => o.name.length > 0);
    if (!nameKo || options.length === 0) continue;
    out.push({
      id: g.groupLocalId.trim() || newLocalOptionId(),
      nameKo,
      description: description || undefined,
      sortOrder,
      inputType,
      isRequired,
      minSelect,
      maxSelect,
      options,
    });
  }
  return out;
}
