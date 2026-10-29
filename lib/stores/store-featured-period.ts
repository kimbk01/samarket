/**
 * v4 PL-06 — 추천 매장(`stores.is_featured`) 기간 판정 단일 정의.
 *
 * - `featured_start_at` / `featured_end_at` 은 관리자 HS-07 이 저장한다 (null = 그쪽 경계 무기한).
 * - 유효 = is_featured AND (start IS NULL OR start <= now) AND (end IS NULL OR now < end).
 * - 컬럼을 읽지 않은 행(구 RPC payload 등 — 키 자체 없음)은 기존처럼 is_featured 만으로 판정한다.
 */
export type StoreFeaturedPeriodRow = {
  is_featured?: boolean | null;
  featured_start_at?: string | null;
  featured_end_at?: string | null;
};

function parseMs(raw: unknown): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function isStoreFeaturedActive(row: StoreFeaturedPeriodRow, nowMs: number = Date.now()): boolean {
  if (row.is_featured !== true) return false;
  const startMs = parseMs(row.featured_start_at);
  if (startMs != null && nowMs < startMs) return false;
  const endMs = parseMs(row.featured_end_at);
  if (endMs != null && nowMs >= endMs) return false;
  return true;
}
