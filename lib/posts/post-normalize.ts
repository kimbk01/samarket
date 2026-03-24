/**
 * posts 행 정규화 (서버·클라이언트 공용, "use client" 없음)
 */

/** DB에서 온 price를 number | null 로 통일 (numeric → string 대비) */
export function normalizePostPrice(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isNaN(n) ? null : n;
}

/** DB에서 온 meta를 객체로 통일 (jsonb가 string으로 올 수 있음) */
export function normalizePostMeta(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === "object" && parsed != null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** DB에서 온 images를 항상 string[] | null 로 통일 (text[] 직렬화 차이 대비) */
export function normalizePostImages(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const arr = raw.filter((x): x is string => typeof x === "string");
    return arr.length > 0 ? arr : null;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const arr = parsed.filter((x): x is string => typeof x === "string");
        return arr.length > 0 ? arr : null;
      }
    } catch {
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      return parts.length > 0 ? parts : null;
    }
  }
  return null;
}
