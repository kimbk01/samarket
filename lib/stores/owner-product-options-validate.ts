import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { ProductOptionGroup } from "@/lib/stores/owner-product-options-json";
import { optionsJsonToFormGroups, ownerOptionsClampInt } from "@/lib/stores/owner-product-options-json";

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
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): { ok: true } | { ok: false; message: string } {
  if (groups.length === 0) return { ok: true };

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!;
    const label = groupLabel(lang, gi);

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

      const pd = parseNonNegInt(o.priceDelta);
      if (pd === null) {
        return {
          ok: false,
          message: optT(lang, "store_owner_opt_choice_price_invalid", { group: label, name }),
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
  | { ok: false; error: "invalid_options_json"; message: string } {
  if (raw === null || raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      error: "invalid_options_json",
      message: optT(lang, "store_owner_opt_invalid_json"),
    };
  }
  const groups = optionsJsonToFormGroups(raw);
  const v = validateProductOptionGroups(groups, lang);
  if (!v.ok) return { ok: false, error: "invalid_options_json", message: v.message };
  return { ok: true, value: raw as unknown[] };
}
