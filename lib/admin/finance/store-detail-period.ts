/**
 * R4-d (재감사 2026-11-03) — 관리자 매장 재무 상세: 위 합계(store-statement)와 아래 거래 목록이 **같은 기간**을 쓴다.
 * - 필터에 from/to(PHT 날짜, 둘 다 포함)가 있으면 합계도 그 기간(custom)으로 조회한다.
 * - 목록은 합계 응답의 기간(fromDay~toDay, 포함)을 그대로 쓴다 → 합계 기간이 정해지기 전에는 목록을 조회하지 않는다.
 * - statement.toIso 는 끝 날짜 다음날 00:00 PHT(배타) → 포함 끝 날짜 = 그 시각 − 1ms 의 PHT 날짜.
 * 클라이언트 안전 (서버 전용 import 금지).
 */
import { manilaDateKey } from "@/lib/admin/metrics/manila-period";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function validDay(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!DAY_RE.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  // 2026-02-31 같은 없는 날짜 거름
  return new Date(ms).toISOString().startsWith(s) ? s : null;
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().substring(0, 10);
}

/**
 * 필터 → store-statement·daily-statement 조회 파라미터.
 * - from·to 둘 다: custom(from~to). 시작 > 종료면 서로 바꾼다.
 * - from 만: custom(from~오늘 PHT) — 목록이 「from 이후 전체」였던 동작과 같다.
 * - to 만: custom(to−29일~to) — 기본 30일 창을 to 에서 끝낸다.
 * - 둘 다 없음: 프리셋(period, 기본 30d).
 */
export function storeStatementQueryParams(input: {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): { period: string; fromDay?: string; toDay?: string } {
  let from = validDay(input.from);
  let to = validDay(input.to);
  if (!from && !to) return { period: String(input.period ?? "").trim() || "30d" };
  if (from && !to) {
    to = manilaDateKey((input.now ?? new Date()).toISOString()) ?? from;
  } else if (!from && to) {
    from = addDays(to, -29);
  }
  if (from! > to!) [from, to] = [to, from];
  return { period: "custom", fromDay: from!, toDay: to! };
}

/** 배타 끝 시각(다음날 00:00 PHT) → 포함 끝 날짜(PHT). */
export function inclusiveManilaEndDay(toIsoExclusive: string | null | undefined): string | null {
  const ms = Date.parse(String(toIsoExclusive ?? ""));
  if (!Number.isFinite(ms)) return null;
  return manilaDateKey(new Date(ms - 1).toISOString());
}

/** 합계 응답 → 목록·머리글이 쓸 포함 기간 [fromDay, toDay] (PHT). */
export function statementInclusiveDays(input: {
  period?: { fromDay?: string | null; toDay?: string | null } | null;
  fromIso?: string | null;
  toIso?: string | null;
}): { fromDay: string; toDay: string } | null {
  const fromDay = validDay(input.period?.fromDay) ?? manilaDateKey(input.fromIso ?? null);
  const toDay = validDay(input.period?.toDay) ?? inclusiveManilaEndDay(input.toIso ?? null);
  if (!fromDay || !toDay) return null;
  return { fromDay, toDay };
}

/** 머리글 「YYYY-MM-DD ~ YYYY-MM-DD (PHT)」. */
export function formatStoreStatementPeriodLabel(days: { fromDay: string; toDay: string } | null): string {
  if (!days) return "—";
  return `${days.fromDay} ~ ${days.toDay} (PHT)`;
}
