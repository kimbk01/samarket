/**
 * OPS-03 / OPS-08 — 실효 영업 판정 고정 fixture 표.
 * TS(`resolveStoreFrontCommerceState`)는 vitest 로, 주문 RPC 의 SQL 판정 함수는 격리 DB 에서 **같은 표**로 검증한다.
 * 시각은 모두 Asia/Manila(+08:00) 기준. 2026-10-19 = 월요일.
 */
import type { StoreFrontCommerceReason } from "@/lib/stores/store-auto-hours";

const auto = (extra: Record<string, unknown> = {}, open = "09:00", close = "22:00") => ({
  auto_business_hours: {
    enabled: true,
    schedule_enforced: true,
    timezone: "Asia/Manila",
    open,
    close,
    ...extra,
  },
});

export type StoreFrontCommerceFixture = {
  name: string;
  business_hours_json: unknown;
  is_open: boolean | null;
  /** ISO with +08:00 */
  at: string;
  open: boolean;
  reason: StoreFrontCommerceReason;
};

export const STORE_FRONT_COMMERCE_FIXTURES: StoreFrontCommerceFixture[] = [
  // --- 하위 호환: weekly/closed_dates 없음 = 기존 단일 구간 ---
  { name: "legacy daily inside", business_hours_json: auto(), is_open: true, at: "2026-10-19T12:00:00+08:00", open: true, reason: "open" },
  { name: "legacy daily before open", business_hours_json: auto(), is_open: true, at: "2026-10-19T08:59:00+08:00", open: false, reason: "outside_hours" },
  { name: "legacy daily at close (exclusive)", business_hours_json: auto(), is_open: true, at: "2026-10-19T22:00:00+08:00", open: false, reason: "outside_hours" },
  { name: "legacy overnight after midnight", business_hours_json: auto({}, "18:00", "02:00"), is_open: true, at: "2026-10-20T01:30:00+08:00", open: true, reason: "open" },
  { name: "legacy overnight after close", business_hours_json: auto({}, "18:00", "02:00"), is_open: true, at: "2026-10-20T02:00:00+08:00", open: false, reason: "outside_hours" },
  { name: "auto off ignores schedule", business_hours_json: { auto_business_hours: { enabled: false, schedule_enforced: false, timezone: "Asia/Manila", open: "09:00", close: "22:00", weekly: { mon: null } } }, is_open: true, at: "2026-10-19T03:00:00+08:00", open: true, reason: "open" },
  { name: "manual closed wins", business_hours_json: auto(), is_open: false, at: "2026-10-19T12:00:00+08:00", open: false, reason: "manual_closed" },
  { name: "null is_open = open", business_hours_json: auto(), is_open: null, at: "2026-10-19T12:00:00+08:00", open: true, reason: "open" },

  // --- 요일별 ---
  { name: "monday closed weekday", business_hours_json: auto({ weekly: { mon: null } }), is_open: true, at: "2026-10-19T12:00:00+08:00", open: false, reason: "closed_day" },
  { name: "monday closed via empty array", business_hours_json: auto({ weekly: { mon: [] } }), is_open: true, at: "2026-10-19T12:00:00+08:00", open: false, reason: "closed_day" },
  { name: "tuesday unset falls back to default", business_hours_json: auto({ weekly: { mon: null } }), is_open: true, at: "2026-10-20T12:00:00+08:00", open: true, reason: "open" },
  { name: "saturday custom short hours inside", business_hours_json: auto({ weekly: { sat: [{ open: "10:00", close: "14:00" }] } }), is_open: true, at: "2026-10-24T13:59:00+08:00", open: true, reason: "open" },
  { name: "saturday custom short hours outside", business_hours_json: auto({ weekly: { sat: [{ open: "10:00", close: "14:00" }] } }), is_open: true, at: "2026-10-24T15:00:00+08:00", open: false, reason: "outside_hours" },
  { name: "split shift gap", business_hours_json: auto({ weekly: { mon: [{ open: "08:00", close: "11:00" }, { open: "17:00", close: "21:00" }] } }), is_open: true, at: "2026-10-19T12:00:00+08:00", open: false, reason: "outside_hours" },
  { name: "split shift second window", business_hours_json: auto({ weekly: { mon: [{ open: "08:00", close: "11:00" }, { open: "17:00", close: "21:00" }] } }), is_open: true, at: "2026-10-19T18:00:00+08:00", open: true, reason: "open" },

  // --- 자정 넘김 + 요일 ---
  { name: "friday overnight tail on saturday", business_hours_json: auto({ weekly: { fri: [{ open: "18:00", close: "02:00" }], sat: null } }), is_open: true, at: "2026-10-24T01:00:00+08:00", open: true, reason: "open" },
  { name: "closed saturday after friday tail", business_hours_json: auto({ weekly: { fri: [{ open: "18:00", close: "02:00" }], sat: null } }), is_open: true, at: "2026-10-24T03:00:00+08:00", open: false, reason: "closed_day" },
  { name: "sunday closed means no monday tail", business_hours_json: auto({ weekly: { sun: null } }, "18:00", "02:00"), is_open: true, at: "2026-10-19T01:00:00+08:00", open: false, reason: "outside_hours" },

  // --- 휴무일(임시휴무) ---
  { name: "closed date all day", business_hours_json: auto({ closed_dates: ["2026-10-19"] }), is_open: true, at: "2026-10-19T12:00:00+08:00", open: false, reason: "closed_day" },
  { name: "closed date next day open", business_hours_json: auto({ closed_dates: ["2026-10-19"] }), is_open: true, at: "2026-10-20T12:00:00+08:00", open: true, reason: "open" },
  { name: "closed date keeps previous night tail", business_hours_json: auto({ closed_dates: ["2026-10-20"] }, "18:00", "02:00"), is_open: true, at: "2026-10-20T01:00:00+08:00", open: true, reason: "open" },
  { name: "closed date cancels own overnight tail", business_hours_json: auto({ closed_dates: ["2026-10-19"] }, "18:00", "02:00"), is_open: true, at: "2026-10-20T01:00:00+08:00", open: false, reason: "outside_hours" },
  { name: "closed date uses store timezone (UTC still previous day)", business_hours_json: auto({ closed_dates: ["2026-10-20"] }, "00:00", "23:59"), is_open: true, at: "2026-10-20T07:00:00+08:00", open: false, reason: "closed_day" },

  // --- 휴게 겹침 ---
  { name: "break inside hours", business_hours_json: { ...auto(), break_hours: { start: "14:00", end: "15:00" } }, is_open: true, at: "2026-10-19T14:30:00+08:00", open: false, reason: "break" },
  { name: "break on closed weekday reports closed day", business_hours_json: { ...auto({ weekly: { mon: null } }), break_hours: { start: "14:00", end: "15:00" } }, is_open: true, at: "2026-10-19T14:30:00+08:00", open: false, reason: "closed_day" },
  { name: "break with manual closed reports manual", business_hours_json: { ...auto(), break_hours: { start: "14:00", end: "15:00" } }, is_open: false, at: "2026-10-19T14:30:00+08:00", open: false, reason: "manual_closed" },
];
