/**
 * Admin 표시 형식 SSOT (수정 계획 2-7) — 금액·건수. 시간은 `formatAdminManilaDateTime`/`formatAdminManilaDate`(PHT).
 * 화면에서 `toLocaleString`·`Intl` 을 직접 쓰지 않는다 (래칫). 클라이언트 안전.
 */

const PHP = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const COUNT = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

/** 페소 금액(major) → 「₱1,234.5」. 값 없음 = 「—」. */
export function formatAdminPhp(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n < 0 ? "-" : ""}₱${PHP.format(Math.abs(n))}`;
}

/** 센타보(minor) → 「₱1,234.5」. */
export function formatAdminPhpMinor(minor: number | string | null | undefined): string {
  const n = typeof minor === "string" ? Number(minor) : minor;
  if (n == null || !Number.isFinite(n)) return "—";
  return formatAdminPhp(Math.trunc(n) / 100);
}

/** 건수·포인트 등 정수 → 「1,234」. 값 없음 = 「—」. */
export function formatAdminNumber(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  return COUNT.format(Math.trunc(n));
}

/** 소수 허용 숫자 (비율·평점 등) → 「1,234.5」. */
export function formatAdminDecimal(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n)) return "—";
  return DECIMAL.format(n);
}
