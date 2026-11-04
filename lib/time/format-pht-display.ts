/**
 * 광고 ② D-12 (Owner 2026-11-04): 고객 화면 날짜·시각 = **PHT(Asia/Manila) 고정** — 기기 시간대와 상관없이 같은 문자열.
 * - ko: 「11월 6일 18:00」
 * - en: 「Nov 6, 18:00」
 * 24시간제. 정산 화면의 `formatManilaDateTime`(`YYYY-MM-DD HH:mm`)과는 형식이 달라 따로 둔다.
 */
export const PHT_TIME_ZONE = "Asia/Manila" as const;

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

let partsFormatter: Intl.DateTimeFormat | null = null;
function phtParts(d: Date): { month: number; day: number; hour: number; minute: number } {
  partsFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: PHT_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = partsFormatter.formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { month: pick("month"), day: pick("day"), hour: pick("hour") % 24, minute: pick("minute") };
}

/** PHT 「11월 6일 18:00」 / 「Nov 6, 18:00」. 잘못된 값이면 빈 문자열. */
export function formatPhtDisplayDateTime(
  value: string | number | Date | null | undefined,
  language: string | null | undefined
): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const { month, day, hour, minute } = phtParts(d);
  if (![month, day, hour, minute].every(Number.isFinite)) return "";
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  if (language === "en") return `${EN_MONTHS[month - 1] ?? ""} ${day}, ${hh}:${mm}`;
  return `${month}월 ${day}일 ${hh}:${mm}`;
}
