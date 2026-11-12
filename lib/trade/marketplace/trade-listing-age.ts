/**
 * 거래 글 작성 시각 표시 · NEW 판정 — 목록 카드·거래 상세가 함께 쓰는 단일 규칙 (Owner 2026-11-03 「v5대로 구현」).
 *
 * 단위 경계·반올림은 참고 앱 웹 목록 카드와 같다(date-fns `formatDistanceToNowStrict`, roundingMethod "round"):
 * 1분 미만 = 초 · 60분 미만 = 분 · 24시간 미만 = 시간 · 30일 미만 = 일 · 12개월 미만 = 개월 · 그 뒤 = 년.
 * 날짜(「11월 3일」)로 바꾸지 않는다. 끌올 기능이 없으므로 기준 시각은 `created_at` 하나.
 */

import type { MessageKey } from "@/lib/i18n/messages";

export type TradeListingAgeTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const MINUTE_MS = 60_000;
const MINUTES_IN_DAY = 1_440;
const MINUTES_IN_MONTH = 43_200;
const MINUTES_IN_YEAR = 525_600;

/** NEW 표시 기간 — Owner 승인 v5: 작성 후 24시간 */
export const TRADE_LISTING_NEW_WINDOW_MS = 24 * 60 * MINUTE_MS;

export type TradeListingAgeUnit = "seconds" | "minutes" | "hours" | "days" | "months" | "years";

function parseMs(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const ms = Date.parse(createdAt);
  return Number.isFinite(ms) ? ms : null;
}

/** 경과 시간 → (단위, 수). 미래 시각·0은 1초로 본다. */
export function resolveTradeListingAge(
  createdAt: string | null | undefined,
  nowMs: number
): { unit: TradeListingAgeUnit; count: number } | null {
  const created = parseMs(createdAt);
  if (created == null) return null;
  const diffMs = Math.max(0, nowMs - created);
  const minutes = diffMs / MINUTE_MS;
  if (minutes < 1) return { unit: "seconds", count: Math.max(1, Math.round(diffMs / 1000)) };
  if (minutes < 60) return { unit: "minutes", count: Math.round(minutes) };
  if (minutes < MINUTES_IN_DAY) return { unit: "hours", count: Math.round(minutes / 60) };
  if (minutes < MINUTES_IN_MONTH) return { unit: "days", count: Math.round(minutes / MINUTES_IN_DAY) };
  if (minutes < MINUTES_IN_YEAR) {
    const months = Math.round(minutes / MINUTES_IN_MONTH);
    return months === 12 ? { unit: "years", count: 1 } : { unit: "months", count: months };
  }
  return { unit: "years", count: Math.round(minutes / MINUTES_IN_YEAR) };
}

const AGE_KEY: Record<TradeListingAgeUnit, MessageKey> = {
  seconds: "trade_age_seconds",
  minutes: "trade_age_minutes",
  hours: "trade_age_hours",
  days: "trade_age_days",
  months: "trade_age_months",
  years: "trade_age_years",
};

/** 「3시간 전」「2개월 전」 — 값이 없으면 빈 문자열 */
export function tradeListingAgeLabel(
  createdAt: string | null | undefined,
  nowMs: number,
  t: TradeListingAgeTranslate
): string {
  const age = resolveTradeListingAge(createdAt, nowMs);
  if (!age) return "";
  return t(AGE_KEY[age.unit], { count: age.count });
}

/** 작성 후 24시간 안 */
export function isTradeListingNew(createdAt: string | null | undefined, nowMs: number): boolean {
  const created = parseMs(createdAt);
  if (created == null) return false;
  const diff = nowMs - created;
  return diff >= -MINUTE_MS && diff < TRADE_LISTING_NEW_WINDOW_MS;
}
