/**
 * Admin 저장 낙관적 동시성(CAS) 공용 계약 — 클라이언트·서버 공용(서버 전용 import 금지).
 *
 * - 클라이언트: 화면이 불러온 시점의 `updated_at` 을 `expected_updated_at` 으로 보낸다.
 * - 서버: 값이 없으면 400 `expected_updated_at_required`, 현재 값과 다르면 409 `stale_updated_at`
 *   (수수료 정책은 기존 코드 `stale_policy`). 쓰기는 `.eq("updated_at", expected)` 조건부 UPDATE.
 */

export const ADMIN_STALE_UPDATED_AT = "stale_updated_at" as const;
export const ADMIN_EXPECTED_UPDATED_AT_REQUIRED = "expected_updated_at_required" as const;

/** 409 충돌 코드 — UI 는 이 코드면 최신 데이터를 다시 불러온다. */
export const ADMIN_CONFLICT_ERROR_CODES: ReadonlySet<string> = new Set([
  ADMIN_STALE_UPDATED_AT,
  "stale_policy",
]);

export function isAdminConflictErrorCode(code: string | null | undefined): boolean {
  return ADMIN_CONFLICT_ERROR_CODES.has(String(code ?? "").trim());
}

/** body 값 → 비어 있지 않은 문자열 또는 null. */
export function readExpectedUpdatedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

/** 같은 시각인지 — 표기(Z / +00:00, 소수 자릿수) 차이는 무시. 파싱 불가면 문자열 비교. */
export function sameUpdatedAtInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a == null ? null : String(a).trim() || null;
  const y = b == null ? null : String(b).trim() || null;
  if (!x || !y) return x === y;
  if (x === y) return true;
  const micro = (s: string): string | null => {
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(s);
    if (!m) return null;
    const base = Date.parse(`${m[1]}T${m[2]}${normalizeTz(m[4])}`);
    if (!Number.isFinite(base)) return null;
    const frac = (m[3] ?? "").padEnd(6, "0").slice(0, 6);
    return `${base}.${frac}`;
  };
  const mx = micro(x);
  const my = micro(y);
  if (mx && my) return mx === my;
  const tx = Date.parse(x);
  const ty = Date.parse(y);
  return Number.isFinite(tx) && Number.isFinite(ty) ? tx === ty : false;
}

function normalizeTz(tz: string | undefined): string {
  if (!tz || /^z$/i.test(tz)) return "Z";
  if (/^[+-]\d{2}$/.test(tz)) return `${tz}:00`;
  if (/^[+-]\d{4}$/.test(tz)) return `${tz.slice(0, 3)}:${tz.slice(3)}`;
  return tz;
}
