/**
 * OPS-03 — 공개 매장 정보 화면의 요일별 영업시간·휴무 예정일 표시 (판정 모델과 같은 `readAutoBusinessHoursConfig`).
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { readAutoBusinessHoursConfig } from "@/lib/stores/store-auto-hours";
import {
  STORE_WEEKDAY_DISPLAY_ORDER,
  upcomingStoreClosedDates,
  type StoreWeekdayKey,
} from "@/lib/stores/store-weekly-hours";

export const STORE_WEEKDAY_LABEL_KEY: Record<StoreWeekdayKey, MessageKey> = {
  mon: "store_hours_day_mon",
  tue: "store_hours_day_tue",
  wed: "store_hours_day_wed",
  thu: "store_hours_day_thu",
  fri: "store_hours_day_fri",
  sat: "store_hours_day_sat",
  sun: "store_hours_day_sun",
};

export type StoreWeeklyHoursDisplayRow = {
  day: StoreWeekdayKey;
  /** "09:00–22:00, 17:00–23:00" · null = 휴무 */
  hoursLabel: string | null;
};

export type StoreWeeklyHoursDisplay = {
  /** weekly 미설정이면 null (기존 「매일」 문구 유지) */
  rows: StoreWeeklyHoursDisplayRow[] | null;
  upcomingClosedDates: string[];
};

export function buildStoreWeeklyHoursDisplay(
  businessHoursJson: unknown,
  now: Date = new Date()
): StoreWeeklyHoursDisplay {
  const cfg = readAutoBusinessHoursConfig(businessHoursJson);
  if (!cfg) return { rows: null, upcomingClosedDates: [] };
  const upcoming = upcomingStoreClosedDates(cfg.closedDates, cfg.timezone, now);
  if (!cfg.weekly) return { rows: null, upcomingClosedDates: upcoming };
  const rows = STORE_WEEKDAY_DISPLAY_ORDER.map((day) => {
    const v = cfg.weekly?.[day];
    const intervals = v === undefined ? [{ open: cfg.open, close: cfg.close }] : v;
    return {
      day,
      hoursLabel: intervals.length === 0 ? null : intervals.map((iv) => `${iv.open}–${iv.close}`).join(", "),
    };
  });
  return { rows, upcomingClosedDates: upcoming };
}
