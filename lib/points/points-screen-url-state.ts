/**
 * 포인트 화면(S40) 주소 상태 — 기간·쪽·대기 거르기 (재감사 R6-d · R6-a · R6-e · R4).
 *
 * - 주소 키: `period`(this_month 면 생략) · `pfrom`·`pto`(직접 기간, PHT 날짜) · `page`(내역 쪽, 1부터 · 1이면 생략) ·
 *   `cpage`(충전 신청 쪽) · `cstatus=pending`(대기 건만). 탭은 기존 `tab`(useMypageTabParam).
 * - `from` 은 이미 고객센터 뒤로가기(`from=customer-center`)가 쓰고 있어 기간 시작은 `pfrom` 으로 둔다.
 * - 쓰기는 `history.replaceState`(기록 쌓지 않음) — 다른 화면 갔다 돌아오면 같은 기간·쪽으로 복원.
 * 순수 함수만 — 화면·API 가 같은 규칙을 쓴다.
 */
import type { MePointsPeriodQuery } from "@/lib/points/me-points-client";
import {
  STORE_COMMISSION_PARSE_PERIODS,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";

export type PointsScreenUrlState = {
  period: MePointsPeriodQuery;
  /** 내역 쪽 (0부터) */
  histPage: number;
  /** 충전 신청 쪽 (0부터) */
  chargePage: number;
  chargeStatus: "pending" | null;
};

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 실제 있는 날짜 `YYYY-MM-DD` 인가 (2026-02-31 같은 값 거름) */
export function isValidPointsDay(v: string | null | undefined): v is string {
  const m = DAY_RE.exec(String(v ?? "").trim());
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function pageNum(raw: string | null): number {
  const n = Math.trunc(Number(raw ?? ""));
  return Number.isFinite(n) && n >= 1 ? n - 1 : 0;
}

export function parsePointsScreenUrlState(sp: Pick<URLSearchParams, "get">): PointsScreenUrlState {
  const raw = String(sp.get("period") ?? "").trim();
  const period = (STORE_COMMISSION_PARSE_PERIODS as readonly string[]).includes(raw)
    ? (raw as StoreCommissionPeriod)
    : "this_month";
  const fromDay = String(sp.get("pfrom") ?? "").trim();
  const toDay = String(sp.get("pto") ?? "").trim();
  return {
    period:
      period === "custom"
        ? { period: "custom", fromDay: isValidPointsDay(fromDay) ? fromDay : "", toDay: isValidPointsDay(toDay) ? toDay : "" }
        : { period },
    histPage: pageNum(sp.get("page")),
    chargePage: pageNum(sp.get("cpage")),
    chargeStatus: sp.get("cstatus") === "pending" ? "pending" : null,
  };
}

/** 현재 주소 쿼리(다른 키 보존) + 상태 → 새 쿼리 문자열(`?` 제외). 기본값 키는 지운다. */
export function writePointsScreenUrlState(search: string, state: PointsScreenUrlState): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const k of ["period", "pfrom", "pto", "page", "cpage", "cstatus"]) params.delete(k);
  if (state.period.period !== "this_month") params.set("period", state.period.period);
  if (state.period.period === "custom") {
    if (state.period.fromDay) params.set("pfrom", state.period.fromDay);
    if (state.period.toDay) params.set("pto", state.period.toDay);
  }
  if (state.histPage > 0) params.set("page", String(state.histPage + 1));
  if (state.chargePage > 0) params.set("cpage", String(state.chargePage + 1));
  if (state.chargeStatus) params.set("cstatus", state.chargeStatus);
  return params.toString();
}

export type PointsPeriodCheck = "ok" | "incomplete" | "inverted";

/**
 * 직접 기간 확인 (R4 화면 쪽) — 두 날짜가 다 있어야 조회, 시작 > 종료면 조회하지 않고 안내.
 * 직접 기간이 아니면 항상 ok.
 */
export function checkPointsPeriod(p: MePointsPeriodQuery): PointsPeriodCheck {
  if (p.period !== "custom") return "ok";
  if (!isValidPointsDay(p.fromDay) || !isValidPointsDay(p.toDay)) return "incomplete";
  return p.fromDay > p.toDay ? "inverted" : "ok";
}

/** 기간 열쇠 — 이 기간 합계를 이미 보여 주고 있는지 비교용 */
export function pointsPeriodKey(p: MePointsPeriodQuery): string {
  return p.period === "custom" ? `custom:${p.fromDay ?? ""}~${p.toDay ?? ""}` : p.period;
}

/** 전체 건수가 줄어 현재 쪽이 비면 마지막 쪽으로 (조용한 재조회 뒤 위치 유지) */
export function clampPointsPage(page: number, total: number, pageSize: number): number {
  const last = Math.max(0, Math.ceil(Math.max(0, total) / pageSize) - 1);
  return Math.min(Math.max(0, Math.trunc(page) || 0), last);
}
