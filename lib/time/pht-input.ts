/**
 * 날짜·시각 입력칸 ↔ ISO — **필리핀 시간(PHT, UTC+8) 고정** (R5 B24).
 * 기기 시간대(예: 한국)와 상관없이 입력한 7:00 PM 이 화면 표시(`formatPhtDisplayDateTime` · PHT)의 7:00 PM 과 같다.
 * 필리핀은 서머타임이 없어 +08:00 고정이다.
 */
import { PHT_TIME_ZONE } from "@/lib/time/format-pht-display";

const PHT_OFFSET = "+08:00";
const pad = (n: number) => String(n).padStart(2, "0");

let fmt: Intl.DateTimeFormat | null = null;

/** ISO → PHT 날짜(`YYYY-MM-DD`)·시각(`HH:mm`) 입력값. 비었거나 잘못되면 빈 값 */
export function isoToPhtInputs(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  fmt ??= new Intl.DateTimeFormat("en-US", {
    timeZone: PHT_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const y = pick("year");
  const m = pick("month");
  const day = pick("day");
  const hh = pick("hour") % 24;
  const mm = pick("minute");
  if (![y, m, day, hh, mm].every(Number.isFinite)) return { date: "", time: "" };
  return { date: `${y}-${pad(m)}-${pad(day)}`, time: `${pad(hh)}:${pad(mm)}` };
}

/** PHT 날짜·시각 입력값 → ISO(UTC). 형식이 틀리거나 없는 날짜(2월 30일 등)면 null */
export function phtInputsToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00${PHT_OFFSET}`);
  if (Number.isNaN(d.getTime())) return null;
  /** 넘친 날짜(2026-02-30 → 3월 2일)는 거부 — 되돌린 값이 같아야 한다 */
  const back = isoToPhtInputs(d.toISOString());
  if (back.date !== date || back.time !== time) return null;
  return d.toISOString();
}
