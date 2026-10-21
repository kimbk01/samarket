/**
 * OPS-03 — `business_hours_json.auto_business_hours` 확장 모델 (요일별 영업시간·휴무일).
 *
 * 저장 형태 (모두 선택 키 — 없으면 기존 단일 open/close 해석과 동일):
 *   weekly:       { sun|mon|tue|wed|thu|fri|sat: [{ open:"HH:mm", close:"HH:mm" }, ...] | null }
 *                 - 키 없음 = 기본 open/close 적용 / null 또는 [] = 그 요일 휴무
 *                 - open > close 는 자정 넘김(다음날 close 까지 같은 영업일)
 *   closed_dates: ["YYYY-MM-DD", ...]  — 매장 시간대 기준 영업일 휴무(임시휴무)
 *
 * 판정은 `schedule_enforced === true` 인 자동 영업시간에서만 적용된다 (`readAutoBusinessHoursConfig`).
 * 같은 규칙의 SQL 판정 함수(주문 RPC 재검증, OPS-08)는 이 모듈의 fixture 표와 동일해야 한다.
 * 이 파일은 import 순환을 피하려고 store-auto-hours 를 import 하지 않는다.
 */

export const STORE_WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type StoreWeekdayKey = (typeof STORE_WEEKDAY_KEYS)[number];

/** 오너 폼·공개 표시 순서 (월→일) */
export const STORE_WEEKDAY_DISPLAY_ORDER: readonly StoreWeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

export type StoreHoursInterval = { open: string; close: string };
/** 요일 값: 구간 배열(빈 배열 = 휴무) */
export type StoreWeeklyHours = Partial<Record<StoreWeekdayKey, StoreHoursInterval[]>>;

export const STORE_WEEKLY_MAX_INTERVALS_PER_DAY = 3;
export const STORE_CLOSED_DATES_MAX = 120;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function normHHMM(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!m) return null;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

export function hhmmToMinutesStrict(hhmm: string): number | null {
  const n = normHHMM(hhmm);
  if (!n) return null;
  const [h, m] = n.split(":").map(Number);
  return h * 60 + m;
}

export function isValidStoreYmd(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const m = YMD_RE.exec(raw.trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function sanitizeIntervals(raw: unknown): StoreHoursInterval[] {
  if (!Array.isArray(raw)) return [];
  const out: StoreHoursInterval[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const open = normHHMM(r.open);
    const close = normHHMM(r.close);
    if (!open || !close || open === close) continue;
    out.push({ open, close });
    if (out.length >= STORE_WEEKLY_MAX_INTERVALS_PER_DAY) break;
  }
  return out;
}

/** 저장·판정 공용 정규화. 유효한 요일 키가 하나도 없으면 null (= weekly 미설정). */
export function sanitizeStoreWeeklyHours(raw: unknown): StoreWeeklyHours | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: StoreWeeklyHours = {};
  let any = false;
  for (const k of STORE_WEEKDAY_KEYS) {
    if (!(k in src)) continue;
    const v = src[k];
    // null / [] / 잘못된 값만 있는 배열 = 그 요일 휴무 (보수적 — 주문 막힘 쪽)
    out[k] = v === null ? [] : sanitizeIntervals(v);
    any = true;
  }
  return any ? out : null;
}

/** 중복 제거·정렬된 유효 날짜 목록 (최대 STORE_CLOSED_DATES_MAX, 최근 것 우선 보존) */
export function sanitizeStoreClosedDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<string>();
  for (const v of raw) {
    if (isValidStoreYmd(v)) set.add(v.trim());
  }
  const sorted = [...set].sort();
  return sorted.length > STORE_CLOSED_DATES_MAX ? sorted.slice(sorted.length - STORE_CLOSED_DATES_MAX) : sorted;
}

/** 저장용 weekly JSON — 휴무 요일은 null 로 기록 (읽을 때 null/[] 동일). */
export function serializeStoreWeeklyHours(
  weekly: StoreWeeklyHours | null
): Record<string, StoreHoursInterval[] | null> | null {
  if (!weekly) return null;
  const out: Record<string, StoreHoursInterval[] | null> = {};
  let any = false;
  for (const k of STORE_WEEKDAY_KEYS) {
    const v = weekly[k];
    if (v === undefined) continue;
    out[k] = v.length === 0 ? null : v.map((iv) => ({ open: iv.open, close: iv.close }));
    any = true;
  }
  return any ? out : null;
}

export type ZonedDayInfo = { ymd: string; weekday: number; minutes: number };

/** 매장 시간대 기준 날짜·요일(0=일)·분 */
export function getZonedDayInfo(date: Date, timeZone: string): ZonedDayInfo | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    const parts = dtf.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const y = get("year");
    const mo = get("month");
    const d = get("day");
    let h = Number(get("hour"));
    const mi = Number(get("minute"));
    if (h === 24) h = 0;
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    if (!y || !mo || !d || wd < 0 || !Number.isFinite(h) || !Number.isFinite(mi)) return null;
    return { ymd: `${y}-${mo}-${d}`, weekday: wd, minutes: h * 60 + mi };
  } catch {
    return null;
  }
}

export function shiftStoreYmd(ymd: string, days: number): string {
  const m = YMD_RE.exec(ymd);
  if (!m) return ymd;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * 86_400_000;
  const dt = new Date(t);
  const yy = String(dt.getUTCFullYear()).padStart(4, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export type StoreScheduleModel = {
  open: string;
  close: string;
  weekly: StoreWeeklyHours | null;
  closedDates: readonly string[];
};

/** 영업일(ymd, weekday) 의 영업 구간 — 휴무일·휴무 요일이면 [] */
export function storeIntervalsForBusinessDay(
  model: StoreScheduleModel,
  ymd: string,
  weekday: number
): StoreHoursInterval[] {
  if (model.closedDates.includes(ymd)) return [];
  const key = STORE_WEEKDAY_KEYS[((weekday % 7) + 7) % 7];
  if (model.weekly && model.weekly[key] !== undefined) return model.weekly[key] ?? [];
  return [{ open: model.open, close: model.close }];
}

export type StoreScheduleEvaluation = {
  /** 지금 영업 구간 안 */
  within: boolean;
  /** 오늘(매장 시간대) 영업 구간이 아예 없음 — 휴무일·휴무 요일 (전날 자정 넘김 꼬리는 별도) */
  closedDay: boolean;
};

/**
 * 영업 구간 판정 — 오늘 구간 + 전날의 자정 넘김 구간 꼬리.
 * weekly·closed_dates 가 없으면 기존 `nowM >= open && nowM < close` / 자정 넘김 공식과 결과가 같다.
 */
export function evaluateStoreSchedule(
  model: StoreScheduleModel,
  timeZone: string,
  now: Date
): StoreScheduleEvaluation {
  const info = getZonedDayInfo(now, timeZone);
  if (!info) return { within: false, closedDay: false };
  const nowM = info.minutes;
  const today = storeIntervalsForBusinessDay(model, info.ymd, info.weekday);
  const yesterday = storeIntervalsForBusinessDay(model, shiftStoreYmd(info.ymd, -1), info.weekday + 6);

  let within = false;
  for (const iv of today) {
    const o = hhmmToMinutesStrict(iv.open);
    const c = hhmmToMinutesStrict(iv.close);
    if (o == null || c == null) continue;
    if (o < c ? nowM >= o && nowM < c : nowM >= o) {
      within = true;
      break;
    }
  }
  if (!within) {
    for (const iv of yesterday) {
      const o = hhmmToMinutesStrict(iv.open);
      const c = hhmmToMinutesStrict(iv.close);
      if (o == null || c == null) continue;
      if (o > c && nowM < c) {
        within = true;
        break;
      }
    }
  }
  return { within, closedDay: !within && today.length === 0 };
}

/** 오늘 이후(포함) 휴무일 — 공개 표시용 */
export function upcomingStoreClosedDates(
  closedDates: readonly string[],
  timeZone: string,
  now: Date,
  limit = 5
): string[] {
  const info = getZonedDayInfo(now, timeZone);
  if (!info) return [];
  return closedDates.filter((d) => d >= info.ymd).slice(0, limit);
}
