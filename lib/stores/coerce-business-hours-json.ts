/**
 * Supabase jsonb가 객체로 오는 경우가 대부분이나, 일부 경로·구데이터는 문자열로 올 수 있음.
 * 공개 메타·오너 폼에서 동일하게 정규화해 읽기/병합 시 데이터가 사라지지 않게 함.
 */
export function coerceBusinessHoursRecord(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  let v: unknown = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return {};
    try {
      v = JSON.parse(t) as unknown;
    } catch {
      return {};
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  return { ...(v as Record<string, unknown>) };
}
