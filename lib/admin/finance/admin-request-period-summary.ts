/**
 * 관리자 신청 목록(Coin 출금 · Cash 충전 · Point 충전) 기간 조건 + 기간 합계 (H-10 · Owner 2026-11-03).
 *
 * - 기간: 주소 `from`/`to`(PHT YYYY-MM-DD, 관리자 목록 표준 `AdminFilterBar`) — 경계 계산은 정산 화면과 같은
 *   `parseStoreCommissionPeriodParams` + `resolveStoreCommissionPeriod` (UTC [from, to)).
 * - 합계: 고른 기간 **전체**(현재 쪽이 아님)를 서버에서 계산 — 신청 n건·금액 / 승인(지급) / 반려 / 대기 / 취소.
 *   상태 필터와 무관하게 상태별로 나눠 보여 준다. DB 변경 없음 (기존 테이블을 기간 조건으로 읽기만).
 */
import {
  parseStoreCommissionPeriodParams,
  resolveStoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";

export type AdminRequestPeriod = {
  fromDay: string | null;
  toDay: string | null;
  /** Inclusive start (UTC ISO) — null = 제한 없음. */
  fromIso: string | null;
  /** Exclusive end (UTC ISO) — null = 제한 없음. */
  toIso: string | null;
};

/** 주소 `from`/`to` (또는 `period`) → 기간. 둘 다 없으면 전체 기간. */
export function parseAdminRequestPeriod(sp: Pick<URLSearchParams, "get">, now: Date = new Date()): AdminRequestPeriod {
  const { period, fromDay, toDay } = parseStoreCommissionPeriodParams(sp);
  const { fromIso, toIso } = resolveStoreCommissionPeriod(period, fromDay, toDay, now);
  return { fromDay, toDay, fromIso, toIso };
}

export type AdminRequestStatusBuckets = {
  approved: readonly string[];
  rejected: readonly string[];
  pending: readonly string[];
};

export type AdminRequestBucketTotal = { count: number; amount: number; amount2: number };

export type AdminRequestPeriodSummary = {
  fromDay: string | null;
  toDay: string | null;
  /** 기간 내 전체 신청. */
  requested: AdminRequestBucketTotal;
  /** 승인·지급 완료. */
  approved: AdminRequestBucketTotal;
  rejected: AdminRequestBucketTotal;
  /** 처리 대기 (승인 전·지급 전). */
  pending: AdminRequestBucketTotal;
  /** 취소 등 위 셋에 들지 않는 상태. */
  other: AdminRequestBucketTotal;
  /** 행이 너무 많아 일부만 합산했을 때 true (화면에 「일부만 합산」 표시). */
  truncated: boolean;
};

const zero = (): AdminRequestBucketTotal => ({ count: 0, amount: 0, amount2: 0 });

/** 순수 합산 — 상태별 건수·금액(amount, 보조 amount2). 금액은 정수 단위(Coin·centavo·P) 그대로 더한다. */
export function summarizeAdminRequestRows(
  rows: ReadonlyArray<{ status: unknown; amount: unknown; amount2?: unknown }>,
  buckets: AdminRequestStatusBuckets,
  period: { fromDay: string | null; toDay: string | null } = { fromDay: null, toDay: null },
  truncated = false
): AdminRequestPeriodSummary {
  const out: AdminRequestPeriodSummary = {
    fromDay: period.fromDay,
    toDay: period.toDay,
    requested: zero(),
    approved: zero(),
    rejected: zero(),
    pending: zero(),
    other: zero(),
    truncated,
  };
  const norm = (list: readonly string[]) => new Set(list.map((s) => s.toUpperCase()));
  const approved = norm(buckets.approved);
  const rejected = norm(buckets.rejected);
  const pending = norm(buckets.pending);
  for (const r of rows) {
    const status = String(r.status ?? "").trim().toUpperCase();
    const amount = Math.trunc(Number(r.amount) || 0);
    const amount2 = Math.trunc(Number(r.amount2) || 0);
    const bucket = approved.has(status)
      ? out.approved
      : rejected.has(status)
        ? out.rejected
        : pending.has(status)
          ? out.pending
          : out.other;
    for (const b of [out.requested, bucket]) {
      b.count += 1;
      b.amount += amount;
      b.amount2 += amount2;
    }
  }
  return out;
}

const SUMMARY_PAGE = 1000;
const SUMMARY_MAX_PAGES = 50;

type SummaryQuery = {
  select: (cols: string) => SummaryQuery;
  gte: (col: string, v: string) => SummaryQuery;
  lt: (col: string, v: string) => SummaryQuery;
  eq: (col: string, v: string) => SummaryQuery;
  order: (col: string, o: { ascending: boolean }) => SummaryQuery;
  range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
};

/**
 * 기간 내 신청 행(상태·금액 열만)을 1,000줄씩 읽어 합산한다. 최대 50,000줄 — 넘으면 `truncated`.
 * 실패 시 null (목록은 그대로 보이고 합계 줄만 숨김).
 */
export async function loadAdminRequestPeriodSummary(
  sb: { from: (table: string) => unknown },
  input: {
    table: string;
    timeColumn: string;
    statusColumn: string;
    amountColumn: string;
    amount2Column?: string;
    period: AdminRequestPeriod;
    buckets: AdminRequestStatusBuckets;
    eq?: Record<string, string>;
  }
): Promise<AdminRequestPeriodSummary | null> {
  const cols = ["id", input.statusColumn, input.amountColumn, input.amount2Column].filter(Boolean).join(", ");
  const rows: Array<{ status: unknown; amount: unknown; amount2?: unknown }> = [];
  let truncated = false;
  for (let page = 0; ; page += 1) {
    if (page >= SUMMARY_MAX_PAGES) {
      truncated = true;
      break;
    }
    let q = (sb.from(input.table) as SummaryQuery).select(cols);
    if (input.period.fromIso) q = q.gte(input.timeColumn, input.period.fromIso);
    if (input.period.toIso) q = q.lt(input.timeColumn, input.period.toIso);
    for (const [k, v] of Object.entries(input.eq ?? {})) q = q.eq(k, v);
    const { data, error } = await q
      .order("id", { ascending: true })
      .range(page * SUMMARY_PAGE, page * SUMMARY_PAGE + SUMMARY_PAGE - 1);
    if (error) return null;
    const list = (data ?? []) as Array<Record<string, unknown>>;
    for (const r of list) {
      rows.push({
        status: r[input.statusColumn],
        amount: r[input.amountColumn],
        amount2: input.amount2Column ? r[input.amount2Column] : 0,
      });
    }
    if (list.length < SUMMARY_PAGE) break;
  }
  return summarizeAdminRequestRows(rows, input.buckets, input.period, truncated);
}

/** Coin 출금: 지급 완료 = PAID · 승인(APPROVED)은 아직 송금 전이라 대기. */
export const COIN_WITHDRAWAL_SUMMARY_BUCKETS: AdminRequestStatusBuckets = {
  approved: ["PAID"],
  rejected: ["REJECTED"],
  pending: ["REQUESTED", "APPROVED"],
};

export const CASH_CHARGE_SUMMARY_BUCKETS: AdminRequestStatusBuckets = {
  approved: ["APPROVED"],
  rejected: ["REJECTED"],
  pending: ["PENDING"],
};

export const POINT_CHARGE_SUMMARY_BUCKETS: AdminRequestStatusBuckets = {
  approved: ["approved"],
  rejected: ["rejected"],
  pending: ["pending", "waiting_confirm", "on_hold"],
};
