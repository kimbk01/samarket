/**
 * Admin 지표 기간 기준 — Asia/Manila (UTC+8, DST 없음). 저장 시각은 UTC 그대로 두고
 * 집계 경계·표시만 마닐라 달력으로 계산한다. 수수료 원장과 같은 달력을 재사용한다.
 * (클라이언트 안전 — 서버 전용 모듈 import 금지)
 */

import {
  formatManilaDateTime,
  resolveStoreCommissionPeriod,
  STORE_COMMISSION_TIMEZONE,
} from "@/lib/stores/commission/store-commission-ledger-query";

export const ADMIN_METRICS_TIMEZONE = STORE_COMMISSION_TIMEZONE;

const MANILA_OFFSET_HOURS = 8;

/** 마닐라 「오늘」 [fromIso, toIso) — UTC instant. */
export function manilaTodayRangeUtc(now: Date = new Date()): { fromIso: string; toIso: string } {
  const r = resolveStoreCommissionPeriod("today", null, null, now);
  return { fromIso: r.fromIso as string, toIso: r.toIso as string };
}

/** UTC instant → 마닐라 달력 날짜 "YYYY-MM-DD" (값 없음 = null). DB 일 버킷(`AT TIME ZONE 'Asia/Manila'`)과 동일. */
export function manilaDateKey(iso: string | null | undefined): string | null {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + MANILA_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 최근 N일(오늘 포함) 통계 범위 — 마닐라 자정 경계 [rangeStartIso, todayEndExIso).
 * 서버 TZ(Vercel=UTC)와 무관하게 `resolveStoreCommissionPeriod("today")` 위에서 계산한다.
 */
export function manilaLastNDaysRangeUtc(
  days: number,
  now: Date = new Date()
): { todayStartIso: string; todayEndExIso: string; rangeStartIso: string } {
  const n = Math.max(1, Math.floor(Number.isFinite(days) ? days : 1));
  const { fromIso, toIso } = manilaTodayRangeUtc(now);
  const rangeStart = new Date(Date.parse(fromIso) - (n - 1) * 86_400_000);
  return { todayStartIso: fromIso, todayEndExIso: toIso, rangeStartIso: rangeStart.toISOString() };
}

/** UTC instant → 마닐라 "YYYY-MM-DD HH:mm" (값 없음 = "—"). */
export function formatAdminManilaDateTime(iso: string | null | undefined): string {
  return formatManilaDateTime(iso);
}

/** UTC 시(0–23) 버킷 → 마닐라 시(0–23). 시간대 오프셋이 정수 시간이라 버킷 손실이 없다. */
export function manilaHourFromUtcHour(utcHour: number): number {
  const h = Math.floor(Number(utcHour));
  if (!Number.isFinite(h)) return 0;
  return (((h + MANILA_OFFSET_HOURS) % 24) + 24) % 24;
}

/** UTC 시 버킷 배열을 마닐라 0–23시 24칸으로 재배치한다. */
export function rebucketUtcHoursToManila(
  rows: readonly { hour: number; count: number }[]
): { hour: number; count: number }[] {
  const out = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const r of rows) {
    const n = Number(r.count);
    if (!Number.isFinite(n)) continue;
    out[manilaHourFromUtcHour(r.hour)].count += n;
  }
  return out;
}

/** 마닐라 「오늘」 시작(자정 00:00 PHT)의 UTC instant ISO — 서버 TZ(`setHours(0,0,0,0)`) 대체. */
export function manilaTodayStartUtcIso(now: Date = new Date()): string {
  return manilaTodayRangeUtc(now).fromIso;
}

type AdminDateInput = string | number | Date | null | undefined;

function toValidDate(value: AdminDateInput): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(typeof value === "number" ? value : Date.parse(String(value)));
  return Number.isFinite(d.getTime()) ? d : null;
}

let manilaPartsFormatter: Intl.DateTimeFormat | null = null;
const manilaWeekdayFormatters = new Map<string, Intl.DateTimeFormat>();

function manilaParts(d: Date): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  manilaPartsFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_METRICS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const out = { year: "", month: "", day: "", hour: "", minute: "" };
  for (const p of manilaPartsFormatter.formatToParts(d)) {
    if (p.type in out) out[p.type as keyof typeof out] = p.value;
  }
  return out;
}

/** UTC instant → 마닐라 "YYYY-MM-DD" (값 없음·잘못된 값 = "—"). */
export function formatAdminManilaDate(value: AdminDateInput): string {
  const d = toValidDate(value);
  if (!d) return "—";
  const p = manilaParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * 관리자 헤더 시계 — 「2026-10-20 (화) 17:27 PHT」 (en: 「2026-10-20 (Tue) 17:27 PHT」).
 * 기기 시간대와 무관하게 Asia/Manila 로 표시한다.
 */
export function formatAdminHeaderClock(now: Date, language: "ko" | "en" = "ko"): string {
  const p = manilaParts(now);
  const locale = language === "en" ? "en-US" : "ko-KR";
  let wf = manilaWeekdayFormatters.get(locale);
  if (!wf) {
    wf = new Intl.DateTimeFormat(locale, { timeZone: ADMIN_METRICS_TIMEZONE, weekday: "short" });
    manilaWeekdayFormatters.set(locale, wf);
  }
  return `${p.year}-${p.month}-${p.day} (${wf.format(now)}) ${p.hour}:${p.minute} PHT`;
}
