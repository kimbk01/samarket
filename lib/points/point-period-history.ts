/**
 * Point 내역 — 기간(PHT) 선택 · 기간 합계 · 충전 신청 페이지 (설계 `docs/audit/currency-history-screens-design-2026-11-03.md` H-6·H-7·H-8).
 * 회원 `/api/me/points` 와 관리자 `/api/admin/users/[id]/points` 가 같은 함수를 쓴다 (한 함수, 두 호출처).
 *
 * - 기간 경계는 매장 정산 화면과 같은 규칙(`resolveStoreCommissionPeriod`, Asia/Manila 날짜 → UTC `[fromIso, toIso)`).
 * - 분류는 새로 만들지 않는다 — `normalizePointFinancialCategory`(내역 목록과 같은 분류)를 부호로 나눠 칸에 담는다.
 * - 기간 시작 잔액 = 기간 시작 전 마지막 줄의 `balance_after`(없으면 0), 기간 종료 잔액 = 기간 안 마지막 줄의 `balance_after`
 *   (없으면 시작 잔액). 시작 + 적립 − 사용 = 종료 가 아니면 `consistent:false` → 화면 「내역 합계가 맞지 않습니다」.
 * - 기간 줄이 `POINT_PERIOD_SUMMARY_ROW_CAP` 를 넘으면 합계를 「일부」로 표시(`capped:true`) — 조용히 틀린 합계 금지.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingPointsTable, normalizeChargeRequest } from "@/lib/points/admin-user-points-shared";
import { normalizePointFinancialCategory } from "@/lib/points/point-financial-history";
import { POINT_CHARGE_REQUEST_ROW_SELECT } from "@/lib/points/point-query-select";
import type { PointChargeRequest } from "@/lib/types/point";
import {
  parseStoreCommissionPeriodParams,
  resolveStoreCommissionPeriod,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";

export const POINT_PERIOD_SUMMARY_ROW_CAP = 5000;
export const POINT_CHARGE_REQUEST_PAGE_SIZE = 20;

/**
 * 화면에서 숨기는 피드 광고 capture 감사 행(금액 0)을 DB 조건으로 미리 뺀다 — 전체 건수가 실제 표시 줄 수와 같게.
 * (`loadPointFinancialHistoryOffsetPage` 와 같은 조건)
 */
export const POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR =
  'entry_type.neq.ad_purchase,entry_type.is.null,related_type.neq.feed_ad_request,related_type.is.null,related_id.is.null,related_id.not.like."capture:*"';

export type PointHistoryPeriod = {
  period: StoreCommissionPeriod;
  fromDay: string | null;
  toDay: string | null;
  /** 포함 시작 (UTC ISO) — null 이면 처음부터 */
  fromIso: string | null;
  /** 제외 끝 (UTC ISO) — null 이면 끝까지 */
  toIso: string | null;
  /** 주소에 기간을 보냈는가 — false 면 목록은 예전처럼 기간 없이, 합계만 이번 달 */
  explicit: boolean;
};

/** `period`·`from`·`to` → 기간. 아무것도 없으면 이번 달(기본). 「전체」는 `period=all` 로 보낸다. */
export function resolvePointHistoryPeriod(
  sp: Pick<URLSearchParams, "get">,
  now: Date = new Date()
): PointHistoryPeriod {
  const explicit = Boolean(
    String(sp.get("period") ?? "").trim() || String(sp.get("from") ?? "").trim() || String(sp.get("to") ?? "").trim()
  );
  const parsed = explicit
    ? parseStoreCommissionPeriodParams(sp)
    : { period: "this_month" as const, fromDay: null, toDay: null };
  const { fromIso, toIso } = resolveStoreCommissionPeriod(parsed.period, parsed.fromDay, parsed.toDay, now);
  return { ...parsed, fromIso, toIso, explicit };
}

export type PointPeriodLedgerRow = {
  id?: string | null;
  amount: number | string | null;
  balance_after: number | string | null;
  entry_type?: string | null;
  related_type?: string | null;
  created_at?: string | null;
};

export type PointPeriodBucket = "charge" | "grant" | "refund" | "use" | "reclaim";

/**
 * 줄 → 칸. 내역 목록과 같은 분류(`normalizePointFinancialCategory`, admin_adjust 는 부호로 지급/차감).
 * 적립(+): 충전 / 지급(이벤트·관리자) / 환불·환원(그 밖의 +: 환불·보류 해제·주문 할인 환원 등)
 * 사용(−): 회수·차감(관리자 차감·기간 만료·회수) / 사용(홍보·광고·보류·상품권·주문 할인 등)
 */
export function pointPeriodBucket(entryType: string, relatedType: string, amount: number): PointPeriodBucket | null {
  if (!amount) return null;
  const et = String(entryType ?? "").trim().toLowerCase();
  let category = normalizePointFinancialCategory(et, String(relatedType ?? ""));
  if (et === "admin_adjust") category = amount > 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT";
  if (amount > 0) {
    if (category === "CHARGE") return "charge";
    if (category === "REWARD" || category === "ADMIN_CREDIT") return "grant";
    return "refund";
  }
  if (category === "ADMIN_DEBIT" || category === "EXPIRATION" || category === "REFUND") return "reclaim";
  return "use";
}

const toInt = (v: unknown) => Math.trunc(Number(v ?? 0) || 0);

/**
 * 같은 시각(한 트랜잭션의 now())에 여러 줄이 있으면 정렬만으로는 마지막 줄을 알 수 없다 →
 * 「다음 줄이 없는 줄」(다른 줄의 직전 잔액 = 이 줄 잔액 인 줄이 없음)을 고른다. 하나로 정해지지 않으면 정렬 첫 줄.
 * `rows` 는 created_at·id 내림차순.
 */
export function pickPointLedgerChainTail<T extends PointPeriodLedgerRow>(rows: readonly T[]): T | null {
  const head = rows[0];
  if (!head) return null;
  const group = rows.filter((r) => String(r.created_at ?? "") === String(head.created_at ?? ""));
  if (group.length < 2) return head;
  const tails = group.filter(
    (r) => !group.some((s) => s !== r && toInt(s.balance_after) - toInt(s.amount) === toInt(r.balance_after))
  );
  return tails.length === 1 ? tails[0]! : head;
}

export type PointPeriodSummary = {
  period: StoreCommissionPeriod;
  fromDay: string | null;
  toDay: string | null;
  fromIso: string | null;
  toIso: string | null;
  openingBalance: number;
  closingBalance: number;
  /** 충전 (+) */
  charge: number;
  /** 지급 — 이벤트·관리자 (+) */
  grant: number;
  /** 환불·환원 — 그 밖의 + (+) */
  refund: number;
  /** 사용 (양수로 표기) */
  use: number;
  /** 회수·차감 (양수로 표기) */
  reclaim: number;
  totalCredit: number;
  totalDebit: number;
  /** 기간 안 줄 수 (정확한 건수) */
  rowCount: number;
  /** 줄 수가 상한을 넘어 합계가 일부만 반영됨 */
  capped: boolean;
  cap: number;
  /** 시작 + 적립 − 사용 = 종료 ? (capped 면 null — 판정 불가) */
  consistent: boolean | null;
};

/** 순수 계산 — rows 는 기간 안 줄(created_at·id 내림차순). */
export function computePointPeriodSummary(input: {
  period: Pick<PointHistoryPeriod, "period" | "fromDay" | "toDay" | "fromIso" | "toIso">;
  openingBalance: number;
  rows: readonly PointPeriodLedgerRow[];
  rowCount?: number | null;
  cap?: number;
}): PointPeriodSummary {
  const sums: Record<PointPeriodBucket, number> = { charge: 0, grant: 0, refund: 0, use: 0, reclaim: 0 };
  for (const r of input.rows) {
    const amount = toInt(r.amount);
    const b = pointPeriodBucket(String(r.entry_type ?? ""), String(r.related_type ?? ""), amount);
    if (b) sums[b] += Math.abs(amount);
  }
  const tail = pickPointLedgerChainTail(input.rows);
  const closingBalance = tail ? toInt(tail.balance_after) : input.openingBalance;
  const totalCredit = sums.charge + sums.grant + sums.refund;
  const totalDebit = sums.use + sums.reclaim;
  const rowCount = input.rowCount ?? input.rows.length;
  const capped = rowCount > input.rows.length;
  return {
    period: input.period.period,
    fromDay: input.period.fromDay,
    toDay: input.period.toDay,
    fromIso: input.period.fromIso,
    toIso: input.period.toIso,
    openingBalance: input.openingBalance,
    closingBalance,
    ...sums,
    totalCredit,
    totalDebit,
    rowCount,
    capped,
    cap: input.cap ?? POINT_PERIOD_SUMMARY_ROW_CAP,
    consistent: capped ? null : input.openingBalance + totalCredit - totalDebit === closingBalance,
  };
}

/** 기간 합계 — 운영 DB 읽기만. */
export async function loadPointPeriodSummary(
  sb: SupabaseClient,
  userId: string,
  period: PointHistoryPeriod
): Promise<{ ok: true; summary: PointPeriodSummary } | { ok: false; error: string }> {
  const uid = userId.trim();
  let openingBalance = 0;
  if (period.fromIso) {
    const { data, error } = await sb
      .from("point_ledger")
      .select("id, amount, balance_after, created_at")
      .eq("user_id", uid)
      .lt("created_at", period.fromIso)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(10);
    if (error) return { ok: false, error: error.message };
    const tail = pickPointLedgerChainTail((data ?? []) as PointPeriodLedgerRow[]);
    openingBalance = tail ? toInt(tail.balance_after) : 0;
  }
  let q = sb
    .from("point_ledger")
    .select("id, amount, balance_after, entry_type, related_type, created_at", { count: "exact" })
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(POINT_PERIOD_SUMMARY_ROW_CAP);
  if (period.fromIso) q = q.gte("created_at", period.fromIso);
  if (period.toIso) q = q.lt("created_at", period.toIso);
  const { data, error, count } = await q;
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as PointPeriodLedgerRow[];
  return {
    ok: true,
    summary: computePointPeriodSummary({
      period,
      openingBalance,
      rows,
      rowCount: typeof count === "number" ? count : rows.length,
    }),
  };
}

export type PointChargeRequestPeriodSummary = {
  requested: { count: number; paymentAmount: number; pointAmount: number };
  approved: { count: number; paymentAmount: number; pointAmount: number };
  rejected: { count: number; paymentAmount: number; pointAmount: number };
  /** 대기 — 입금 대기·확인 중·보류 */
  pending: { count: number; paymentAmount: number; pointAmount: number };
  cancelled: { count: number; paymentAmount: number; pointAmount: number };
  capped: boolean;
};

type ChargeSumRow = { request_status?: string | null; payment_amount?: number | string | null; point_amount?: number | string | null };

export function computePointChargeRequestPeriodSummary(
  rows: readonly ChargeSumRow[],
  rowCount?: number | null
): PointChargeRequestPeriodSummary {
  const z = () => ({ count: 0, paymentAmount: 0, pointAmount: 0 });
  const out: PointChargeRequestPeriodSummary = {
    requested: z(),
    approved: z(),
    rejected: z(),
    pending: z(),
    cancelled: z(),
    capped: (rowCount ?? rows.length) > rows.length,
  };
  for (const r of rows) {
    const pay = Number(r.payment_amount ?? 0) || 0;
    const pt = toInt(r.point_amount);
    const add = (k: keyof Omit<PointChargeRequestPeriodSummary, "capped">) => {
      out[k].count += 1;
      out[k].paymentAmount += pay;
      out[k].pointAmount += pt;
    };
    add("requested");
    const st = String(r.request_status ?? "").toLowerCase();
    if (st === "approved" || st === "completed") add("approved");
    else if (st === "rejected") add("rejected");
    else if (st === "cancelled") add("cancelled");
    else add("pending");
  }
  return out;
}

export type PointChargeRequestsPage = {
  items: PointChargeRequest[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

/** 충전 신청 목록 — 신청 시각(requested_at) 기준 기간 + offset 페이지 + 정확한 전체 건수. */
export async function loadPointChargeRequestsPage(
  sb: SupabaseClient,
  input: {
    userId: string;
    userNickname: string;
    fromIso: string | null;
    toIso: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<{ ok: true; page: PointChargeRequestsPage } | { ok: false; error: string; missing?: boolean }> {
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(input.limit ?? POINT_CHARGE_REQUEST_PAGE_SIZE)) || POINT_CHARGE_REQUEST_PAGE_SIZE));
  const offset = Math.max(0, Math.trunc(Number(input.offset ?? 0)) || 0);
  let q = sb
    .from("point_charge_requests")
    .select(POINT_CHARGE_REQUEST_ROW_SELECT, { count: "exact" })
    .eq("user_id", input.userId)
    .order("requested_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (input.fromIso) q = q.gte("requested_at", input.fromIso);
  if (input.toIso) q = q.lt("requested_at", input.toIso);
  const { data, error, count } = await q;
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_charge_requests")) {
      return { ok: true, page: { items: [], total: 0, offset, limit, hasMore: false } };
    }
    return { ok: false, error: error.message };
  }
  const items = (data ?? []).map((row) =>
    normalizeChargeRequest(row as Record<string, unknown>, input.userId, input.userNickname)
  );
  const total = typeof count === "number" ? count : offset + items.length;
  return { ok: true, page: { items, total, offset, limit, hasMore: offset + items.length < total } };
}

export async function loadPointChargeRequestPeriodSummary(
  sb: SupabaseClient,
  input: { userId: string; fromIso: string | null; toIso: string | null }
): Promise<{ ok: true; summary: PointChargeRequestPeriodSummary } | { ok: false; error: string }> {
  let q = sb
    .from("point_charge_requests")
    .select("request_status, payment_amount, point_amount", { count: "exact" })
    .eq("user_id", input.userId)
    .order("requested_at", { ascending: false })
    .limit(POINT_PERIOD_SUMMARY_ROW_CAP);
  if (input.fromIso) q = q.gte("requested_at", input.fromIso);
  if (input.toIso) q = q.lt("requested_at", input.toIso);
  const { data, error, count } = await q;
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_charge_requests")) {
      return { ok: true, summary: computePointChargeRequestPeriodSummary([]) };
    }
    return { ok: false, error: error.message };
  }
  const rows = (data ?? []) as ChargeSumRow[];
  return { ok: true, summary: computePointChargeRequestPeriodSummary(rows, typeof count === "number" ? count : rows.length) };
}

/** 회원이 취소할 수 있는 대기 신청 수 — 기간과 무관 (「충전 요청 대기 n」 줄) */
export async function countCancellablePointChargeRequests(sb: SupabaseClient, userId: string): Promise<number | null> {
  const { count, error } = await sb
    .from("point_charge_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("request_status", ["pending", "waiting_confirm"]);
  if (error) return null;
  return typeof count === "number" ? count : null;
}

export type PointHistoryPeriodExtras = {
  period: PointHistoryPeriod;
  periodSummary: PointPeriodSummary | null;
  periodSummaryError?: true;
  chargeRequests: PointChargeRequest[];
  chargeRequestsPage: Omit<PointChargeRequestsPage, "items">;
  chargeSummary: PointChargeRequestPeriodSummary | null;
  pendingChargeCount: number | null;
};

/**
 * 회원·관리자 포인트 API 공용 — 기간·기간 합계·충전 신청(기간·페이지·합계).
 * 기간을 보내지 않은 예전 호출: 충전 신청은 기간 없이 최근 20건(예전과 같음), 합계만 이번 달.
 */
export async function loadPointHistoryPeriodExtras(
  sb: SupabaseClient,
  input: {
    userId: string;
    userNickname: string;
    period: PointHistoryPeriod;
    chargeOffset?: number;
    chargeLimit?: number;
    /** false 면 기간 합계를 건너뛴다 (「더 보기」 다음 페이지 요청) */
    withSummary?: boolean;
  }
): Promise<{ ok: true; extras: PointHistoryPeriodExtras } | { ok: false; error: string }> {
  const { period } = input;
  const listFrom = period.explicit ? period.fromIso : null;
  const listTo = period.explicit ? period.toIso : null;
  const withSummary = input.withSummary !== false;
  const [summaryRes, chargePageRes, chargeSumRes, pendingChargeCount] = await Promise.all([
    withSummary ? loadPointPeriodSummary(sb, input.userId, period) : Promise.resolve(null),
    loadPointChargeRequestsPage(sb, {
      userId: input.userId,
      userNickname: input.userNickname,
      fromIso: listFrom,
      toIso: listTo,
      offset: input.chargeOffset,
      limit: input.chargeLimit,
    }),
    withSummary
      ? loadPointChargeRequestPeriodSummary(sb, { userId: input.userId, fromIso: period.fromIso, toIso: period.toIso })
      : Promise.resolve(null),
    countCancellablePointChargeRequests(sb, input.userId),
  ]);
  if (!chargePageRes.ok) return { ok: false, error: chargePageRes.error };
  if (summaryRes && !summaryRes.ok) console.error("[points period] summary failed", summaryRes.error);
  if (chargeSumRes && !chargeSumRes.ok) console.error("[points period] charge summary failed", chargeSumRes.error);
  const { items, ...pageMeta } = chargePageRes.page;
  return {
    ok: true,
    extras: {
      period,
      periodSummary: summaryRes && summaryRes.ok ? summaryRes.summary : null,
      ...(summaryRes && !summaryRes.ok ? { periodSummaryError: true as const } : {}),
      chargeRequests: items,
      chargeRequestsPage: pageMeta,
      chargeSummary: chargeSumRes && chargeSumRes.ok ? chargeSumRes.summary : null,
      pendingChargeCount,
    },
  };
}
