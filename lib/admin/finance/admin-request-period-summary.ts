/**
 * 관리자 신청 목록(Coin 출금 · Cash 충전 · Point 충전) 기간 조건 + 기간 합계 (H-10 · Owner 2026-11-03).
 *
 * - 기간: 주소 `from`/`to`(PHT YYYY-MM-DD, 관리자 목록 표준 `AdminFilterBar`) — 경계 계산은 정산 화면과 같은
 *   `parseStoreCommissionPeriodParams` + `resolveStoreCommissionPeriod` (UTC [from, to)).
 * - 합계: 고른 기간 **전체**(현재 쪽이 아님)를 서버에서 계산 — 신청 n건·금액 / 승인(지급) / 반려 / 대기 / 취소.
 *   상태 필터와 무관하게 상태별로 나눠 보여 준다. DB 변경 없음 (기존 테이블을 기간 조건으로 읽기만).
 * - R3-i (재감사 2026-11-03): 「신청」「대기」「취소」 = **신청 시각** 기준, 「승인·지급 완료」「반려」 = **처리 시각** 기준
 *   (Point 충전 processed_at · Cash 충전 decided_at · Coin 출금 지급 paid_at / 반려 rejected_at).
 *   → 「이번 달 Coin 출금 지급 얼마」 = 이번 달에 지급 완료 처리된 금액. 처리 칸 합 ≠ 신청 합일 수 있다(기간이 다르므로).
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

/** 칸별 기간 기준 — requested = 신청 시각 · processed = 처리 시각. */
export type AdminRequestSummaryBasis = "requested" | "processed";

export type AdminRequestPeriodSummary = {
  fromDay: string | null;
  toDay: string | null;
  /** 승인·반려 칸의 기간 기준 (없으면 requested — 이전 응답 호환). */
  decidedBasis?: AdminRequestSummaryBasis;
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

type SummaryRow = { status: unknown; amount: unknown; amount2?: unknown };

/**
 * 순수 합산 — 상태별 건수·금액(amount, 보조 amount2). 금액은 정수 단위(Coin·centavo·P) 그대로 더한다.
 * `decided` 를 주면(R3-i) 승인·반려 칸은 **처리 시각**으로 고른 행으로만 센다 — `rows`(신청 시각)는 신청·대기·취소 칸.
 */
export function summarizeAdminRequestRows(
  rows: ReadonlyArray<SummaryRow>,
  buckets: AdminRequestStatusBuckets,
  period: { fromDay: string | null; toDay: string | null } = { fromDay: null, toDay: null },
  truncated = false,
  decided?: { approved: ReadonlyArray<SummaryRow>; rejected: ReadonlyArray<SummaryRow> }
): AdminRequestPeriodSummary {
  const out: AdminRequestPeriodSummary = {
    fromDay: period.fromDay,
    toDay: period.toDay,
    decidedBasis: decided ? "processed" : "requested",
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
      ? decided
        ? null
        : out.approved
      : rejected.has(status)
        ? decided
          ? null
          : out.rejected
        : pending.has(status)
          ? out.pending
          : out.other;
    for (const b of bucket ? [out.requested, bucket] : [out.requested]) {
      b.count += 1;
      b.amount += amount;
      b.amount2 += amount2;
    }
  }
  if (decided) {
    const add = (target: AdminRequestBucketTotal, list: ReadonlyArray<SummaryRow>, allowed: Set<string>) => {
      for (const r of list) {
        if (!allowed.has(String(r.status ?? "").trim().toUpperCase())) continue;
        target.count += 1;
        target.amount += Math.trunc(Number(r.amount) || 0);
        target.amount2 += Math.trunc(Number(r.amount2) || 0);
      }
    };
    add(out.approved, decided.approved, approved);
    add(out.rejected, decided.rejected, rejected);
  }
  return out;
}

/**
 * R3-i — 표마다 처리 시각 열 (마이그레이션 확인 2026-11-03):
 * - `coin_withdrawal_requests`: 지급 완료 `paid_at` · 반려 `rejected_at` (20261202000000)
 * - `business_cash_charge_requests`: 승인·반려 `decided_at` (20261201300000)
 * - `point_charge_requests`: 승인·반려 `processed_at` (승인 RPC·반려 처리 모두 기록)
 * 호출 경로를 바꾸지 않아도(예: Coin 출금 API) 표 이름으로 처리 기준이 적용된다.
 */
export const ADMIN_REQUEST_DECIDED_TIME_COLUMNS: Readonly<Record<string, { approved: string; rejected: string }>> = {
  coin_withdrawal_requests: { approved: "paid_at", rejected: "rejected_at" },
  business_cash_charge_requests: { approved: "decided_at", rejected: "decided_at" },
  point_charge_requests: { approved: "processed_at", rejected: "processed_at" },
};

const SUMMARY_PAGE = 1000;
const SUMMARY_MAX_PAGES = 50;

type SummaryQuery = {
  select: (cols: string) => SummaryQuery;
  gte: (col: string, v: string) => SummaryQuery;
  lt: (col: string, v: string) => SummaryQuery;
  eq: (col: string, v: string) => SummaryQuery;
  in: (col: string, v: readonly string[]) => SummaryQuery;
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
    /** 승인·반려 처리 시각 열 — 없으면 표 이름으로 `ADMIN_REQUEST_DECIDED_TIME_COLUMNS` 를 쓴다. */
    decidedTimeColumns?: { approved: string; rejected: string } | null;
  }
): Promise<AdminRequestPeriodSummary | null> {
  const cols = ["id", input.statusColumn, input.amountColumn, input.amount2Column].filter(Boolean).join(", ");
  const decidedCols = input.decidedTimeColumns ?? ADMIN_REQUEST_DECIDED_TIME_COLUMNS[input.table] ?? null;
  let truncated = false;

  const readAll = async (
    timeColumn: string,
    statuses: readonly string[] | null
  ): Promise<SummaryRow[] | null> => {
    const out: SummaryRow[] = [];
    for (let page = 0; ; page += 1) {
      if (page >= SUMMARY_MAX_PAGES) {
        truncated = true;
        break;
      }
      let q = (sb.from(input.table) as SummaryQuery).select(cols);
      if (input.period.fromIso) q = q.gte(timeColumn, input.period.fromIso);
      if (input.period.toIso) q = q.lt(timeColumn, input.period.toIso);
      if (statuses) q = q.in(input.statusColumn, statuses);
      for (const [k, v] of Object.entries(input.eq ?? {})) q = q.eq(k, v);
      const { data, error } = await q
        .order("id", { ascending: true })
        .range(page * SUMMARY_PAGE, page * SUMMARY_PAGE + SUMMARY_PAGE - 1);
      if (error) return null;
      const list = (data ?? []) as Array<Record<string, unknown>>;
      for (const r of list) {
        out.push({
          status: r[input.statusColumn],
          amount: r[input.amountColumn],
          amount2: input.amount2Column ? r[input.amount2Column] : 0,
        });
      }
      if (list.length < SUMMARY_PAGE) break;
    }
    return out;
  };

  const rows = await readAll(input.timeColumn, null);
  if (!rows) return null;
  // 기간이 없으면(전체 기간) 처리 시각으로 다시 읽을 필요가 없다 — 같은 행 집합.
  if (!decidedCols || (!input.period.fromIso && !input.period.toIso)) {
    const s = summarizeAdminRequestRows(rows, input.buckets, input.period, truncated);
    return decidedCols ? { ...s, decidedBasis: "processed" } : s;
  }
  const [approvedRows, rejectedRows] = await Promise.all([
    readAll(decidedCols.approved, input.buckets.approved),
    readAll(decidedCols.rejected, input.buckets.rejected),
  ]);
  if (!approvedRows || !rejectedRows) return null;
  return summarizeAdminRequestRows(rows, input.buckets, input.period, truncated, {
    approved: approvedRows,
    rejected: rejectedRows,
  });
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
