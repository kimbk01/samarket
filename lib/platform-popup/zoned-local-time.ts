/**
 * 광고 감사 G-10 — 어드민 시작·종료 입력(datetime-local)을 **캠페인 시간대** 벽시계로 읽고 쓴다.
 * 이전에는 어드민 PC 시간대 기준이라, PC 가 마닐라가 아니면 저장 시각이 어긋났다.
 * 잘못된 시간대 문자열이면 기본(Asia/Manila)으로 계산한다.
 */
import { PLATFORM_POPUP_DEFAULT_TIMEZONE } from "@/lib/platform-popup/types";

function safeZone(tz: string | null | undefined): string {
  const z = String(tz ?? "").trim() || PLATFORM_POPUP_DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return z;
  } catch {
    return PLATFORM_POPUP_DEFAULT_TIMEZONE;
  }
}

/** 그 시각에 tz 벽시계가 UTC 보다 앞선 ms */
function zoneOffsetMs(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(utcMs / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → tz 벽시계 `YYYY-MM-DDTHH:mm` (datetime-local 값) */
export function isoToZonedLocalInput(iso: string | null | undefined, tz: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + zoneOffsetMs(safeZone(tz), ms));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** tz 벽시계 `YYYY-MM-DDTHH:mm` → ISO(UTC). 빈 값·잘못된 값 → null */
export function zonedLocalInputToIso(local: string, tz: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!m) return null;
  const zone = safeZone(tz);
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  let utc = wall - zoneOffsetMs(zone, wall);
  // 일광절약 경계: 구한 시각의 오프셋으로 한 번 더 맞춘다
  utc = wall - zoneOffsetMs(zone, utc);
  return Number.isFinite(utc) ? new Date(utc).toISOString() : null;
}
