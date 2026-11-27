import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";
import { normalizeHHMM } from "@/lib/stores/store-auto-hours";
import {
  sanitizeStoreClosedDates,
  sanitizeStoreWeeklyHours,
  serializeStoreWeeklyHours,
  type StoreWeeklyHours,
} from "@/lib/stores/store-weekly-hours";

/**
 * CONTRACT — `business_hours_json.auto_business_hours`
 * DO NOT: `enabled: true` 만 저장하고 `schedule_enforced` 를 빼기(legacy 마감 오판).
 * DO NOT: 공개 `resolveStoreFrontOpen` 과 다른 규칙으로 직렬화하기 — 이 모듈만 쓴다.
 * 공개 스케줄 적용: `enabled === true` AND `schedule_enforced === true` AND 유효 open/close.
 */
export const STORE_AUTO_SCHEDULE_ENFORCED_KEY = "schedule_enforced";

export type AutoBusinessHoursFormSlice = {
  autoBusinessHoursEnabled: boolean;
  autoHoursTz: string;
  autoHoursOpen: string;
  autoHoursClose: string;
  /** OPS-03 요일별 구간 — undefined 면 기존 값 유지 안 함(키 생략), null 이면 미설정 */
  weekly?: StoreWeeklyHours | null;
  /** OPS-03 휴무일 YYYY-MM-DD */
  closedDates?: string[];
};

/**
 * 언어 재감사 2026-11-27: `weekdays` 요약에 화면 문장(「매일」)을 저장하지 않는다 — 시각·시간대 값만.
 * 구조값은 `auto_business_hours.open/close/timezone` 에 있고, 「매일」 같은 말은 화면이 키로 붙인다.
 * 이미 저장된 「매일 …」 옛 행은 고치지 않는다(읽는 쪽 `compactStoreHoursRangeForDisplay` 가 시각만 뽑는다).
 */
function autoWeekdaysSummary(open: string, close: string, tz: string): string {
  return `${open}–${close} (${tz})`;
}

/** OPS-03 — weekly/closed_dates 를 정규화해 auto_business_hours 객체에 붙인다 (비어 있으면 키 생략). */
function attachScheduleExt(
  target: Record<string, unknown>,
  weeklyRaw: unknown,
  closedDatesRaw: unknown
): Record<string, unknown> {
  const weekly = serializeStoreWeeklyHours(sanitizeStoreWeeklyHours(weeklyRaw));
  const closed = sanitizeStoreClosedDates(closedDatesRaw);
  if (weekly) target.weekly = weekly;
  if (closed.length > 0) target.closed_dates = closed;
  return target;
}

/**
 * `business_hours_json.auto_business_hours` — 단일 직렬화(오너 폼·API 계약).
 * - 자동 OFF: 시각은 보존, 공개 쪽은 `readAutoBusinessHoursConfig` 가 null → 수동 `is_open` 만
 * - 자동 ON: `enabled` + `schedule_enforced` 동시 true
 */
export function applyAutoBusinessHoursToRecord(
  prev: Record<string, unknown>,
  slice: AutoBusinessHoursFormSlice
): void {
  const tz = (slice.autoHoursTz || "Asia/Manila").trim() || "Asia/Manila";
  const open = normalizeHHMM(slice.autoHoursOpen.trim());
  const close = normalizeHHMM(slice.autoHoursClose.trim());

  if (!open || !close || open === close) {
    prev.auto_business_hours = {
      enabled: false,
      [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: false,
    };
    return;
  }

  const weeklyIn = slice.weekly === undefined ? undefined : slice.weekly;
  if (slice.autoBusinessHoursEnabled) {
    prev.auto_business_hours = attachScheduleExt(
      {
        enabled: true,
        [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: true,
        timezone: tz,
        open,
        close,
      },
      weeklyIn,
      slice.closedDates
    );
    // 요일별 구간이 있으면 매일 요약은 틀린 정보 — 공개 화면은 weekly 표로 표시한다.
    if (!(prev.auto_business_hours as Record<string, unknown>).weekly) {
      prev.weekdays = autoWeekdaysSummary(open, close, tz);
    }
    return;
  }

  prev.auto_business_hours = attachScheduleExt(
    {
      enabled: false,
      [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: false,
      timezone: tz,
      open,
      close,
    },
    weeklyIn,
    slice.closedDates
  );
}

/**
 * PATCH·DB 직전 정규화 — `enabled:true` 단독(구버전·악의적 payload)을 공개 계약에 맞게 고정.
 * `readAutoBusinessHoursConfig` 와 동일 게이트.
 */
export function sanitizeBusinessHoursJsonForPersistence(raw: unknown): Record<string, unknown> {
  const prev = coerceBusinessHoursRecord(raw);
  const auto = prev.auto_business_hours;
  if (!auto || typeof auto !== "object" || Array.isArray(auto)) return prev;

  const a = auto as Record<string, unknown>;
  const tz =
    typeof a.timezone === "string" && a.timezone.trim() ? a.timezone.trim() : "Asia/Manila";
  const open = typeof a.open === "string" ? normalizeHHMM(a.open) : null;
  const close = typeof a.close === "string" ? normalizeHHMM(a.close) : null;
  const wantsEnforced =
    a.enabled === true && a[STORE_AUTO_SCHEDULE_ENFORCED_KEY] === true;

  if (!open || !close || open === close) {
    prev.auto_business_hours = {
      enabled: false,
      [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: false,
    };
    return prev;
  }

  if (wantsEnforced) {
    prev.auto_business_hours = attachScheduleExt(
      {
        enabled: true,
        [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: true,
        timezone: tz,
        open,
        close,
      },
      a.weekly,
      a.closed_dates
    );
    const wd = typeof prev.weekdays === "string" ? prev.weekdays.trim() : "";
    const hasWeekly = Boolean((prev.auto_business_hours as Record<string, unknown>).weekly);
    if (!wd && !hasWeekly) prev.weekdays = autoWeekdaysSummary(open, close, tz);
    return prev;
  }

  prev.auto_business_hours = attachScheduleExt(
    {
      enabled: false,
      [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: false,
      timezone: tz,
      open,
      close,
    },
    a.weekly,
    a.closed_dates
  );
  return prev;
}

/**
 * 언어 재감사 2026-11-27 (STORED 옛 행 대응) — `weekdays` 자동 요약을 화면 언어로 다시 그린다.
 * - 옛 행 「매일 09:00–22:00 (Asia/Manila)」·새 행 「09:00–22:00 (Asia/Manila)」 → `owner_store_hours_daily_range`
 * - 그 밖(사장님이 직접 쓴 글)은 그대로 둔다.
 */
/** 옛 행 앞말 「매일」 = `\uB9E4\uC77C` (코드 안 한국어 글자 없이 대응) */
const AUTO_WEEKDAYS_SUMMARY = /^(?:\uB9E4\uC77C\s+)?(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})(?:\s*\(([^()]+)\))?$/;

export function localizeStoredWeekdaysSummary(
  raw: string,
  t: (key: "owner_store_hours_daily_range", vars: { range: string }) => string
): string {
  const text = raw.trim();
  const m = AUTO_WEEKDAYS_SUMMARY.exec(text);
  if (!m) return raw;
  const open = normalizeHHMM(m[1] ?? "");
  const close = normalizeHHMM(m[2] ?? "");
  if (!open || !close) return raw;
  const tz = m[3]?.trim();
  return t("owner_store_hours_daily_range", { range: tz ? `${open}–${close} (${tz})` : `${open}–${close}` });
}
