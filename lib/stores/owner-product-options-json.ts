/** 오너 상품 폼 ↔ options_json 직렬화 (DB/API 키: nameKo, inputType, minSelect, maxSelect, isRequired, options) */

export function newLocalOptionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** 옵션 항목 한 줄 — 저장 시 options[] 원소로 직렬화 */
export type ProductOptionItem = {
  id: string;
  name: string;
  priceDelta: string;
  soldOut: boolean;
  defaultSelected: boolean;
};

export type ProductOptionSelectionKind = "single" | "multiple" | "quantity";

/**
 * 옵션 그룹 — `options_json` 배열의 한 원소와 1:1.
 * 추후 `option_templates` 테이블과 재사용 연동 시 `templateGroupId`를 채움.
 */
export type ProductOptionGroup = {
  groupLocalId: string;
  nameKo: string;
  description: string;
  sortOrder: string;
  selectionKind: ProductOptionSelectionKind;
  /** 고객이 반드시 골라야 하는지 — `isRequired` JSON 필드와 동기 */
  required: boolean;
  minSelect: string;
  maxSelect: string;
  options: ProductOptionItem[];
  templateGroupId?: string;
};

/** @deprecated 이름 호환 — 신규 코드는 ProductOption* 사용 */
export type OptionRowForm = ProductOptionItem;
/** @deprecated 이름 호환 */
export type OptionGroupForm = ProductOptionGroup;

export function ownerOptionsClampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return fallback;
  return Math.max(lo, Math.min(hi, x));
}

export function emptyOptionRow(): ProductOptionItem {
  return { id: newLocalOptionId(), name: "", priceDelta: "0", soldOut: false, defaultSelected: false };
}

export function emptyOptionGroup(): ProductOptionGroup {
  return {
    groupLocalId: newLocalOptionId(),
    nameKo: "",
    description: "",
    sortOrder: "0",
    selectionKind: "single",
    required: true,
    minSelect: "1",
    maxSelect: "1",
    options: [emptyOptionRow()],
  };
}

function inferSelectionKindFromJson(inputType: string): ProductOptionSelectionKind {
  const it = inputType.trim();
  if (it === "quantity") return "quantity";
  if (it === "checkbox") return "multiple";
  return "single";
}

/** DB/API options_json 배열 → 폼 상태 */
export function optionsJsonToFormGroups(raw: unknown): ProductOptionGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductOptionGroup[] = [];
  for (let gi = 0; gi < raw.length; gi++) {
    const g = raw[gi];
    if (!g || typeof g !== "object") continue;
    const rec = g as Record<string, unknown>;
    const nameKo = String(rec.nameKo ?? rec.name ?? "").trim();
    const description = String(rec.description ?? "").trim();
    const sortOrder = String(ownerOptionsClampInt(rec.sortOrder, -9999, 9999, gi));
    const it = String(rec.inputType ?? "").trim();
    const minN = ownerOptionsClampInt(rec.minSelect, 0, 99, 0);
    let maxN = ownerOptionsClampInt(rec.maxSelect, 0, 99, 1);
    if (maxN < minN) maxN = minN;
    const minSelect = String(minN);
    const maxSelect = String(maxN);
    const required =
      rec.isRequired === true || rec.required === true || minN >= 1;
    const selectionKind = inferSelectionKindFromJson(it);
    const optsRaw = Array.isArray(rec.options) ? rec.options : [];
    const options: ProductOptionItem[] = optsRaw.map((o, oi) => {
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
    const templateGroupId =
      typeof rec.templateGroupId === "string" && rec.templateGroupId.trim()
        ? rec.templateGroupId.trim()
        : undefined;
    out.push({
      groupLocalId: gid,
      nameKo,
      description,
      sortOrder,
      selectionKind,
      required,
      minSelect,
      maxSelect,
      options: options.length > 0 ? options : [emptyOptionRow()],
      templateGroupId,
    });
  }
  return out;
}

/**
 * 폼 상태 → API `options_json`.
 * 호출 전 `validateProductOptionGroups`로 검증할 것(불완전 그룹을 조용히 제거하지 않음).
 */
export function formGroupsToOptionsJson(groups: ProductOptionGroup[]): unknown[] {
  const out: unknown[] = [];
  for (const g of groups) {
    const nameKo = g.nameKo.trim();
    const description = g.description.trim();
    const sortOrder = ownerOptionsClampInt(parseInt(g.sortOrder, 10), -9999, 9999, 0);
    let minSelect = ownerOptionsClampInt(parseInt(g.minSelect, 10), 0, 99, 0);
    let maxSelect = ownerOptionsClampInt(parseInt(g.maxSelect, 10), 0, 99, 1);
    if (maxSelect < minSelect) maxSelect = minSelect;

    let inputType: "radio" | "checkbox" | "quantity";
    if (g.selectionKind === "quantity") {
      inputType = "quantity";
      minSelect = ownerOptionsClampInt(minSelect, 0, 99, 0);
      maxSelect = ownerOptionsClampInt(maxSelect, Math.max(minSelect, 1), 99, Math.max(minSelect, 3));
    } else if (g.selectionKind === "single") {
      inputType = "radio";
    } else {
      inputType = "checkbox";
    }

    const isRequired = g.required;
    const options = g.options
      .map((o) => ({
        id: o.id.trim() || newLocalOptionId(),
        name: o.name.trim(),
        priceDelta: Math.floor(parseInt(o.priceDelta, 10) || 0),
        soldOut: o.soldOut === true,
        defaultSelected: o.defaultSelected === true,
      }))
      .filter((o) => o.name.length > 0);

    if (options.length === 0) continue;

    const row: Record<string, unknown> = {
      id: g.groupLocalId.trim() || newLocalOptionId(),
      nameKo,
      description: description || undefined,
      sortOrder,
      inputType,
      isRequired,
      minSelect,
      maxSelect,
      options,
    };
    if (g.templateGroupId?.trim()) row.templateGroupId = g.templateGroupId.trim();
    out.push(row);
  }
  return out;
}
