/** 오너/관리 API: options_json 은 JSON 배열이어야 함. null → 빈 배열로 저장해도 됨 */
export function parseProductOptionsJsonField(
  v: unknown
): { ok: true; value: unknown[] } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, value: [] };
  if (!Array.isArray(v)) return { ok: false };
  return { ok: true, value: v };
}
