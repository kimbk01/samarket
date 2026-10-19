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
