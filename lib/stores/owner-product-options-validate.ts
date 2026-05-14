import type { ProductOptionGroup } from "@/lib/stores/owner-product-options-json";
import { optionsJsonToFormGroups, ownerOptionsClampInt } from "@/lib/stores/owner-product-options-json";

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
  groups: ProductOptionGroup[]
): { ok: true } | { ok: false; message: string } {
  if (groups.length === 0) return { ok: true };

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!;
    const label = `옵션 그룹 ${gi + 1}`;

    if (!g.nameKo.trim()) {
      return { ok: false, message: `${label}: 그룹명을 입력해 주세요.` };
    }

    const minSelect = ownerOptionsClampInt(parseInt(g.minSelect, 10), 0, 99, 0);
    let maxSelect = ownerOptionsClampInt(parseInt(g.maxSelect, 10), 0, 99, 1);
    if (maxSelect < minSelect) maxSelect = minSelect;

    if (g.selectionKind === "single") {
      if (g.required) {
        if (minSelect !== 1 || maxSelect !== 1) {
          return {
            ok: false,
            message: `${label}: 단일 선택·필수일 때는 최소·최대 선택 수가 각각 1이어야 합니다.`,
          };
        }
      } else {
        if (minSelect < 0 || maxSelect > 1 || minSelect > maxSelect) {
          return {
            ok: false,
            message: `${label}: 단일 선택(선택)은 0~1개 범위로 설정해 주세요.`,
          };
        }
      }
    } else if (g.selectionKind === "multiple") {
      if (g.required && minSelect < 1) {
        return { ok: false, message: `${label}: 복수 선택·필수일 때는 최소 선택 수가 1 이상이어야 합니다.` };
      }
      if (maxSelect < minSelect) {
        return { ok: false, message: `${label}: 최대 선택 수는 최소 선택 수 이상이어야 합니다.` };
      }
      if (maxSelect < 1) {
        return { ok: false, message: `${label}: 복수 선택에서는 최대 선택 수가 1 이상이어야 합니다.` };
      }
    } else if (g.selectionKind === "quantity") {
      if (maxSelect < 1) {
        return { ok: false, message: `${label}: 수량형은 최대 선택(수량 상한)이 1 이상이어야 합니다.` };
      }
      if (maxSelect < minSelect) {
        return { ok: false, message: `${label}: 수량형에서 최대는 최소 이상이어야 합니다.` };
      }
      if (g.required && minSelect < 1) {
        return {
          ok: false,
          message: `${label}: 수량형·필수일 때는 최소 선택 수가 1 이상이어야 합니다.`,
        };
      }
    }

    const items = g.options;
    if (items.length === 0) {
      return { ok: false, message: `${label}: 선택지를 한 개 이상 추가해 주세요.` };
    }

    let namedCount = 0;
    let defaultCount = 0;

    for (let oi = 0; oi < items.length; oi++) {
      const o = items[oi]!;
      const name = o.name.trim();
      if (!name) {
        return { ok: false, message: `${label}: 선택지 ${oi + 1}의 이름을 입력해 주세요.` };
      }
      namedCount++;

      const pd = parseNonNegInt(o.priceDelta);
      if (pd === null) {
        return {
          ok: false,
          message: `${label}: 「${name}」의 추가 금액은 0 이상 숫자만 입력해 주세요.`,
        };
      }

      if (o.soldOut && o.defaultSelected) {
        return {
          ok: false,
          message: `${label}: 품절인 「${name}」은 기본 선택으로 지정할 수 없습니다.`,
        };
      }

      if (o.defaultSelected) defaultCount++;
    }

    if (namedCount < 1) {
      return { ok: false, message: `${label}: 선택지를 한 개 이상 입력해 주세요.` };
    }

    if (g.selectionKind === "single" && defaultCount > 1) {
      return {
        ok: false,
        message: `${label}: 단일 선택 그룹에서는 기본 선택은 한 개만 지정할 수 있습니다.`,
      };
    }
  }

  return { ok: true };
}

/** API 본문의 `options_json` — 배열만 받은 뒤 폼 역변환하여 동일 규칙 검증 */
export function validateOwnerOptionsJsonPayload(
  raw: unknown
):
  | { ok: true; value: unknown[] }
  | { ok: false; error: "invalid_options_json"; message: string } {
  if (raw === null || raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "invalid_options_json", message: "옵션 형식이 올바르지 않습니다." };
  const groups = optionsJsonToFormGroups(raw);
  const v = validateProductOptionGroups(groups);
  if (!v.ok) return { ok: false, error: "invalid_options_json", message: v.message };
  return { ok: true, value: raw as unknown[] };
}
