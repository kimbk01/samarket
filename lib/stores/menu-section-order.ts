/**
 * 3-E PRD-11 — 메뉴 카테고리 순서 저장 본문 검증 (`PUT /api/me/stores/[storeId]/menu-sections/order`).
 * DB 함수 `reorder_store_menu_sections` 가 같은 규칙(중복·빈 배열·타 매장 id 거부)을 다시 강제한다.
 */

/** sort_order 상한(9999)과 맞춘 한 번 저장 최대 개수 */
export const MENU_SECTION_ORDER_MAX = 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMenuSectionOrderIds(
  raw: unknown
): { ok: true; value: string[] } | { ok: false; error: "invalid_section_ids" | "duplicate_section_ids" } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MENU_SECTION_ORDER_MAX) {
    return { ok: false, error: "invalid_section_ids" };
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const id = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (!UUID_RE.test(id)) return { ok: false, error: "invalid_section_ids" };
    if (seen.has(id)) return { ok: false, error: "duplicate_section_ids" };
    seen.add(id);
    out.push(id);
  }
  return { ok: true, value: out };
}
