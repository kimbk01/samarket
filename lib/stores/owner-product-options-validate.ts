import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { ProductOptionGroup } from "@/lib/stores/owner-product-options-json";
import { optionsJsonToFormGroups, ownerOptionsClampInt } from "@/lib/stores/owner-product-options-json";
import { OWNER_PRODUCT_OPTION_PRICE_DELTA_MAX } from "@/lib/stores/owner-product-field-limits";

/** PRD-14 — 그룹 내 옵션명 비교 키 (주문 검증이 이름으로 매칭하므로 대소문자·공백 차이도 같은 이름으로 본다) */
export function normalizeOwnerOptionChoiceName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export type OwnerOptionsValidationCode =
  | "invalid_options_json"
  | "duplicate_option_name"
  | "duplicate_option_group_id";

function optT(
  lang: AppLanguageCode,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  return translate(lang, key, vars);
}

function groupLabel(lang: AppLanguageCode, gi: number): string {
  return optT(lang, "store_owner_opt_group_label", { index: gi + 1 });
}

function parseNonNegInt(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Math.floor(Number(t));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * 오너 상품 저장 전 옵션 그룹 검증.
 * 그룹이 하나도 없으면 통과(옵션 없는 상품).
 */
export function validateProductOptionGroups(
  groups: ProductOptionGroup[],
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE,
  opts?: { checkGroupIds?: boolean }
): { ok: true } | { ok: false; message: string; code?: OwnerOptionsValidationCode } {
  if (groups.length === 0) return { ok: true };
  const checkGroupIds = opts?.checkGroupIds !== false;
  const seenGroupIds = new Set<string>();

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!;
    const label = groupLabel(lang, gi);

    // PRD-14 — 그룹 id 유일 (주문 스냅샷 그룹 키)
    const gid = String(g.groupLocalId ?? "").trim();
    if (checkGroupIds && gid) {
      if (seenGroupIds.has(gid)) {
        return {
          ok: false,
          code: "duplicate_option_group_id",
          message: optT(lang, "store_owner_opt_duplicate_group_id", { group: label }),
        };
      }
      seenGroupIds.add(gid);
    }

    if (!g.nameKo.trim()) {
      return { ok: false, message: optT(lang, "store_owner_opt_name_required", { group: label }) };
    }

    const minSelect = ownerOptionsClampInt(parseInt(g.minSelect, 10), 0, 99, 0);
    let maxSelect = ownerOptionsClampInt(parseInt(g.maxSelect, 10), 0, 99, 1);
    if (maxSelect < minSelect) maxSelect = minSelect;

    if (g.selectionKind === "single") {
      if (g.required) {
        if (minSelect !== 1 || maxSelect !== 1) {
          return {
            ok: false,
            message: optT(lang, "store_owner_opt_single_required_bounds", { group: label }),
          };
        }
      } else {
        if (minSelect < 0 || maxSelect > 1 || minSelect > maxSelect) {
          return {
            ok: false,
            message: optT(lang, "store_owner_opt_single_optional_bounds", { group: label }),
          };
        }
      }
    } else if (g.selectionKind === "multiple") {
      if (g.required && minSelect < 1) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_multiple_required_min", { group: label }),
        };
      }
      if (maxSelect < minSelect) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_max_gte_min", { group: label }),
        };
      }
      if (maxSelect < 1) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_multiple_max_min_one", { group: label }),
        };
      }
    } else if (g.selectionKind === "quantity") {
      if (maxSelect < 1) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_quantity_max_min_one", { group: label }),
        };
      }
      if (maxSelect < minSelect) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_quantity_max_gte_min", { group: label }),
        };
      }
      if (g.required && minSelect < 1) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_quantity_required_min", { group: label }),
        };
      }
    }

    const items = g.options;
    if (items.length === 0) {
      return {
        ok: false,
        message: optT(lang, "store_owner_opt_choices_required", { group: label }),
      };
    }

    let namedCount = 0;
    let defaultCount = 0;
    const seenNames = new Set<string>();

    for (let oi = 0; oi < items.length; oi++) {
      const o = items[oi]!;
      const name = o.name.trim();
      if (!name) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_choice_name_required", { group: label, index: oi + 1 }),
        };
      }
      namedCount++;

      // PRD-14 — 그룹 내 옵션명 유일 (주문 검증 `modifiers/validate.ts` 가 이름으로 매칭)
      const nameKey = normalizeOwnerOptionChoiceName(name);
      if (seenNames.has(nameKey)) {
        return {
          ok: false,
          code: "duplicate_option_name",
          message: optT(lang, "store_owner_opt_duplicate_choice_name", { group: label, name }),
        };
      }
      seenNames.add(nameKey);

      const pd = parseNonNegInt(o.priceDelta);
      if (pd === null) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_choice_price_invalid", { group: label, name }),
        };
      }
      // PRD-15 — 추가금 상한
      if (pd > OWNER_PRODUCT_OPTION_PRICE_DELTA_MAX) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_choice_price_too_large", {
            group: label,
            name,
            max: OWNER_PRODUCT_OPTION_PRICE_DELTA_MAX.toLocaleString("en-US"),
          }),
        };
      }

      if (o.soldOut && o.defaultSelected) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_choice_sold_out_default", { group: label, name }),
        };
      }

      if (o.defaultSelected) defaultCount++;
    }

    if (namedCount < 1) {
      return {
        ok: false,
        message: optT(lang, "store_owner_opt_choices_named_required", { group: label }),
      };
    }

    if (g.selectionKind === "single" && defaultCount > 1) {
      return {
        ok: false,
        message: optT(lang, "store_owner_opt_single_default_one", { group: label }),
      };
    }
  }

  return { ok: true };
}

/** API 본문의 `options_json` — 배열만 받은 뒤 폼 역변환하여 동일 규칙 검증 */
export function validateOwnerOptionsJsonPayload(
  raw: unknown,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
):
  | { ok: true; value: unknown[] }
  | { ok: false; error: OwnerOptionsValidationCode; message: string } {
  if (raw === null || raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      error: "invalid_options_json",
      message: optT(lang, "store_owner_opt_invalid_json"),
    };
  }
  // PRD-14 — 명시된 그룹 id(`id`·`key`)만 유일성 검사 (id 없는 레거시 그룹은 인덱스 폴백이라 제외)
  const seenRawGroupIds = new Set<string>();
  for (let gi = 0; gi < raw.length; gi++) {
    const rec = raw[gi];
    if (!rec || typeof rec !== "object") continue;
    const r = rec as Record<string, unknown>;
    const gid = String(r.id ?? r.key ?? "").trim();
    if (!gid) continue;
    if (seenRawGroupIds.has(gid)) {
      return {
        ok: false,
        error: "duplicate_option_group_id",
        message: optT(lang, "store_owner_opt_duplicate_group_id", { group: groupLabel(lang, gi) }),
      };
    }
    seenRawGroupIds.add(gid);
  }
  const groups = optionsJsonToFormGroups(raw);
  const v = validateProductOptionGroups(groups, lang, { checkGroupIds: false });
  if (!v.ok) return { ok: false, error: v.code ?? "invalid_options_json", message: v.message };
  return { ok: true, value: raw as unknown[] };
}
