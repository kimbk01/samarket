import type { PostgrestError } from "@supabase/supabase-js";

/** PostgREST/Postgres: 컬럼 미적용 마이그레이션 시 흔한 오류 메시지 */
export function isMissingDbColumnError(err: PostgrestError | null | undefined, column: string): boolean {
  const m = String(err?.message ?? err?.details ?? "").toLowerCase();
  const c = column.toLowerCase();
  if (!m) return false;
  if (m.includes(c) && (m.includes("does not exist") || m.includes("unknown"))) return true;
  if (m.includes("schema cache") && m.includes(c)) return true;
  return false;
}
