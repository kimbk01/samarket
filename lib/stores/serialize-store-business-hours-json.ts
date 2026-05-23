import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";
import { normalizeHHMM } from "@/lib/stores/store-auto-hours";

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
};

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

  if (slice.autoBusinessHoursEnabled) {
    prev.auto_business_hours = {
      enabled: true,
      [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: true,
      timezone: tz,
      open,
      close,
    };
    prev.weekdays = `매일 ${open}–${close} (${tz})`;
    return;
  }

  prev.auto_business_hours = {
    enabled: false,
    [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: false,
    timezone: tz,
    open,
    close,
  };
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
    prev.auto_business_hours = {
      enabled: true,
      [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: true,
      timezone: tz,
      open,
      close,
    };
    const wd = typeof prev.weekdays === "string" ? prev.weekdays.trim() : "";
    if (!wd) prev.weekdays = `매일 ${open}–${close} (${tz})`;
    return prev;
  }

  prev.auto_business_hours = {
    enabled: false,
    [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: false,
    timezone: tz,
    open,
    close,
  };
  return prev;
}
