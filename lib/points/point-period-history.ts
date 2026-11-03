/**
 * Point 내역 — 기간(PHT) 선택 · 기간 합계 · 충전 신청 페이지 (설계 `docs/audit/currency-history-screens-design-2026-11-03.md` H-6·H-7·H-8).
 * 회원 `/api/me/points` 와 관리자 `/api/admin/users/[id]/points` 가 같은 함수를 쓴다 (한 함수, 두 호출처).
 *
 * - 기간 경계는 매장 정산 화면과 같은 규칙(`resolveStoreCommissionPeriod`, Asia/Manila 날짜 → UTC `[fromIso, toIso)`).
 * - 분류는 새로 만들지 않는다 — `normalizePointFinancialCategory`(내역 목록과 같은 분류)를 부호로 나눠 칸에 담는다.
 * - 기간 시작 잔액 = 기간 시작 전 마지막 줄의 `balance_after`(없으면 0), 기간 종료 잔액 = 기간 안 마지막 줄의 `balance_after`
 *   (없으면 시작 잔액). 시작 + 적립 − 사용 = 종료 가 아니면 `consistent:false` → 화면 「내역 합계가 맞지 않습니다」.
 * - 기간 줄은 서버 응답 한도(1,000줄)마다 끝까지 나눠 읽는다(재감사 R3-h). `POINT_PERIOD_SUMMARY_ROW_CAP` 를 넘으면 합계를
 *   「일부」로 표시(`capped:true`) — 조용히 틀린 합계 금지.
 * - 포인트 보류(`ad_hold` −)·보류 해제(`ad_hold_release` +)는 「사용」·「환불·환원」이 아니라 「보류 중」 칸(보류 − 해제)에 담는다.
 *   보류가 승인으로 확정(captured·charged)되면 그 보류 줄이 「사용」 1번이다(확정 감사 줄은 0P라 칸 없음) (재감사 R3-g).
 */
import { pickLedgerChainLatest, type LedgerChainView } from "@/lib/finance/ledger-chain-order";
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

/** 합계 상한 — 이 줄 수까지 1,000줄씩 나눠 읽는다 (재감사 R3-h) */
export const POINT_PERIOD_SUMMARY_ROW_CAP = 50_000;
/** PostgREST 한 번 응답 최대 줄 수 */
export const POINT_SUMMARY_READ_PAGE = 1000;
export const POINT_CHARGE_REQUEST_PAGE_SIZE = 20;
/** 회원이 취소할 수 있는 대기 상태 — 「충전 요청 대기 n」 숫자와 대기 목록이 같은 조건 (재감사 R6-e) */
export const POINT_CHARGE_PENDING_STATUSES = ["pending", "waiting_confirm"] as const;

/**
 * 화면에서 숨기는 승인 확정 감사 행(금액 0 · `ad_purchase` · `capture:*`) — 피드 광고·커뮤니티/거래 상위노출(`promotion_order`).
 * DB 조건으로 미리 빼서 전체 건수가 실제 표시 줄 수와 같게 한다 (재감사 R8-c · 표시 규칙 `isHiddenCaptureAuditRow` 와 같은 조건).
 */
export const POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR =
  'entry_type.neq.ad_purchase,entry_type.is.null,related_type.not.in.(feed_ad_request,promotion_order),related_type.is.null,related_id.is.null,related_id.not.like."capture:*",amount.neq.0';

/** 표시 쪽 같은 규칙 (DB 조건 `POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR` 의 부정) */
export function isHiddenCaptureAuditRow(r: {
  entry_type?: string | null;
  related_type?: string | null;
  related_id?: string | null;
  amount?: number | string | null;
}): boolean {
  const et = String(r.entry_type ?? "").trim().toLowerCase();
  const rt = String(r.related_type ?? "").trim().toLowerCase();
  return (
    et === "ad_purchase" &&
    (rt === "feed_ad_request" || rt === "promotion_order") &&
    String(r.related_id ?? "").startsWith("capture:") &&
    Math.trunc(Number(r.amount ?? 0) || 0) === 0
  );
}

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
  related_id?: string | null;
  created_at?: string | null;
};

export type PointPeriodBucket = "charge" | "grant" | "refund" | "use" | "reclaim" | "hold";

/** 보류·해제 원장 종류 (feed_ad_request · promotion_order · trade_post_ad 공통) */
export const POINT_HOLD_ENTRY_TYPE = "ad_hold";
export const POINT_HOLD_RELEASE_ENTRY_TYPE = "ad_hold_release";

/** 보류 줄 → 보류 행 열쇠 `related_type:대상 id` (`hold:` 접두 제거). 보류 줄이 아니면 null */
export function pointHoldKey(r: Pick<PointPeriodLedgerRow, "entry_type" | "related_type" | "related_id">): string | null {
  if (String(r.entry_type ?? "").trim().toLowerCase() !== POINT_HOLD_ENTRY_TYPE) return null;
  const rt = String(r.related_type ?? "").trim().toLowerCase();
  const id = String(r.related_id ?? "").trim().replace(/^hold:/, "");
  return rt && id ? `${rt}:${id}` : null;
}

/**
 * 줄 → 칸. 내역 목록과 같은 분류(`normalizePointFinancialCategory`, admin_adjust 는 부호로 지급/차감).
 * 적립(+): 충전 / 지급(이벤트·관리자) / 환불·환원(그 밖의 +: 환불·주문 할인 환원 등)
 * 사용(−): 회수·차감(관리자 차감·기간 만료·회수) / 사용(상위노출·광고·상품권·주문 할인 등)
 * 보류(−)·보류 해제(+): 「보류 중」 — 단 보류가 승인으로 확정됐으면(`holdCaptured`) 그 보류 줄은 「사용」 (R3-g)
 */
export function pointPeriodBucket(
  entryType: string,
  relatedType: string,
  amount: number,
  holdCaptured = false
): PointPeriodBucket | null {
  if (!amount) return null;
  const et = String(entryType ?? "").trim().toLowerCase();
  if (et === POINT_HOLD_ENTRY_TYPE) return holdCaptured && amount < 0 ? "use" : "hold";
  if (et === POINT_HOLD_RELEASE_ENTRY_TYPE) return "hold";
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
 * 같은 시각(한 트랜잭션의 now()) 여러 줄 → 잔액 사슬로 마지막 줄 (공용 `orderLedgerChainDesc` · 재감사 R2).
 * `rows` 는 created_at·id 내림차순. `olderBalance` = 이 줄들보다 앞선 잔액(알면).
 */
export function pickPointLedgerChainTail<T extends PointPeriodLedgerRow>(
  rows: readonly T[],
  olderBalance: number | null = null
): T | null {
  return pickLedgerChainLatest(rows, pointChainView, olderBalance);
}

export function pointChainView(r: PointPeriodLedgerRow): LedgerChainView {
  return { createdAt: String(r.created_at ?? ""), signed: toInt(r.amount), balanceAfter: toInt(r.balance_after) };
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
  /** 보류 중 = 기간 안 보류 − 보류 해제 (부호 있음 · 0 이면 화면에서 숨김). 출금 쪽 항목 (R3-g) */
  hold: number;
  totalCredit: number;
  /** 사용 + 회수·차감 + 보류 중(순) */
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
  /** 승인으로 확정된 보류 열쇠(`pointHoldKey`) — 그 보류 줄은 「사용」 */
  capturedHoldKeys?: ReadonlySet<string>;
}): PointPeriodSummary {
  const sums: Record<PointPeriodBucket, number> = { charge: 0, grant: 0, refund: 0, use: 0, reclaim: 0, hold: 0 };
  for (const r of input.rows) {
    const amount = toInt(r.amount);
    const key = pointHoldKey(r);
    const captured = key != null && Boolean(input.capturedHoldKeys?.has(key));
    const b = pointPeriodBucket(String(r.entry_type ?? ""), String(r.related_type ?? ""), amount, captured);
    if (!b) continue;
    // 보류 중은 순값(보류 + · 해제 −), 나머지 칸은 크기
    if (b === "hold") sums.hold -= amount;
    else sums[b] += Math.abs(amount);
  }
  const tail = pickPointLedgerChainTail(input.rows, input.openingBalance);
  const closingBalance = tail ? toInt(tail.balance_after) : input.openingBalance;
  const totalCredit = sums.charge + sums.grant + sums.refund;
  const totalDebit = sums.use + sums.reclaim + sums.hold;
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

/** 보류 행 표 — 보류 줄 `hold:<id>` 의 id 가 가리키는 열 · 확정 상태 (`lib/promotion/promotion-point-hold-flow.ts` 등) */
const POINT_HOLD_TABLES: Record<string, { table: string; column: string }> = {
  promotion_order: { table: "promotion_point_holds", column: "promotion_order_id" },
  feed_ad_request: { table: "feed_ad_point_holds", column: "request_id" },
  trade_post_ad: { table: "trade_ad_point_holds", column: "trade_post_ad_id" },
};
/** 승인으로 확정된 보류 상태 — 피드·상위노출 `captured`, 거래 광고 `charged` */
export const POINT_HOLD_CAPTURED_STATUSES: ReadonlySet<string> = new Set(["captured", "charged"]);

/** 기간 보류 줄 중 승인으로 확정된 것의 열쇠 — 운영 DB 읽기만. 표가 없으면 확정 0 으로 본다. */
export async function loadCapturedPointHoldKeys(
  sb: SupabaseClient,
  rows: readonly PointPeriodLedgerRow[]
): Promise<{ ok: true; keys: Set<string> } | { ok: false; error: string }> {
  const byType = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = pointHoldKey(r);
    if (!key) continue;
    const i = key.indexOf(":");
    const rt = key.slice(0, i);
    if (!POINT_HOLD_TABLES[rt]) continue;
    const set = byType.get(rt) ?? new Set<string>();
    set.add(key.slice(i + 1));
    byType.set(rt, set);
  }
  const keys = new Set<string>();
  for (const [rt, idSet] of byType) {
    const { table, column } = POINT_HOLD_TABLES[rt]!;
    const ids = [...idSet];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await sb.from(table).select(`${column}, status`).in(column, ids.slice(i, i + 200));
      if (error) {
        if (isMissingPointsTable(error.message ?? "", table)) break;
        return { ok: false, error: error.message };
      }
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        if (POINT_HOLD_CAPTURED_STATUSES.has(String(row.status ?? "").toLowerCase())) {
          keys.add(`${rt}:${String(row[column] ?? "")}`);
        }
      }
    }
  }
  return { ok: true, keys };
}

/**
 * 1,000줄씩 끝까지(최대 `cap`) 나눠 읽는다 — PostgREST 는 한 번에 1,000줄까지만 준다 (R3-h).
 * `build(withCount)` 는 매번 새 쿼리(정렬 포함)를 만든다. 첫 요청의 정확한 전체 건수를 돌려준다.
 */
export async function readAllRowsInPages<T>(
  build: (withCount: boolean) => {
    range: (
      from: number,
      to: number
    ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null; count?: number | null }>;
  },
  cap: number = POINT_PERIOD_SUMMARY_ROW_CAP,
  pageSize: number = POINT_SUMMARY_READ_PAGE
): Promise<{ ok: true; rows: T[]; count: number } | { ok: false; error: string }> {
  const rows: T[] = [];
  let count: number | null = null;
  for (let start = 0; start < cap; start += pageSize) {
    const end = Math.min(start + pageSize, cap) - 1;
    const { data, error, count: c } = await build(start === 0).range(start, end);
    if (error) return { ok: false, error: error.message };
    const chunk = (data ?? []) as T[];
    if (start === 0 && typeof c === "number") count = c;
    rows.push(...chunk);
    if (chunk.length < end - start + 1) break;
  }
  return { ok: true, rows, count: count ?? rows.length };
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
  const read = await readAllRowsInPages<PointPeriodLedgerRow>((withCount) => {
    let q = sb
      .from("point_ledger")
      .select("id, amount, balance_after, entry_type, related_type, related_id, created_at", withCount ? { count: "exact" } : undefined)
      .eq("user_id", uid)
      .or(POINT_LEDGER_HIDE_CAPTURE_AUDIT_OR)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (period.fromIso) q = q.gte("created_at", period.fromIso);
    if (period.toIso) q = q.lt("created_at", period.toIso);
    return q;
  });
  if (!read.ok) return { ok: false, error: read.error };
  const captured = await loadCapturedPointHoldKeys(sb, read.rows);
  if (!captured.ok) return { ok: false, error: captured.error };
  return {
    ok: true,
    summary: computePointPeriodSummary({
      period,
      openingBalance,
      rows: read.rows,
      rowCount: read.count,
      capturedHoldKeys: captured.keys,
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
  /** 합계 상한 (capped 문구 숫자) */
  cap?: number;
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
    cap: POINT_PERIOD_SUMMARY_ROW_CAP,
  };
  for (const r of rows) {
    const pay = Number(r.payment_amount ?? 0) || 0;
    const pt = toInt(r.point_amount);
    const add = (k: keyof Omit<PointChargeRequestPeriodSummary, "capped" | "cap">) => {
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

/** 충전 신청 목록 상태 거르기 — `pending` = 회원이 취소할 수 있는 대기(기간 무관 · 「대기 n」 과 같은 조건) */
export type PointChargeRequestStatusFilter = "pending";

export function parsePointChargeStatusFilter(raw: string | null | undefined): PointChargeRequestStatusFilter | null {
  return String(raw ?? "").trim().toLowerCase() === "pending" ? "pending" : null;
}

/**
 * 충전 신청 목록 — 신청 시각(requested_at) 기준 기간 + offset 페이지 + 정확한 전체 건수.
 * `status: "pending"` 이면 기간을 무시하고 대기 건만 (R6-e).
 */
export async function loadPointChargeRequestsPage(
  sb: SupabaseClient,
  input: {
    userId: string;
    userNickname: string;
    fromIso: string | null;
    toIso: string | null;
    limit?: number;
    offset?: number;
    status?: PointChargeRequestStatusFilter | null;
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
  if (input.status === "pending") {
    q = q.in("request_status", [...POINT_CHARGE_PENDING_STATUSES]);
  } else {
    if (input.fromIso) q = q.gte("requested_at", input.fromIso);
    if (input.toIso) q = q.lt("requested_at", input.toIso);
  }
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
  const read = await readAllRowsInPages<ChargeSumRow>((withCount) => {
    let q = sb
      .from("point_charge_requests")
      .select("request_status, payment_amount, point_amount", withCount ? { count: "exact" } : undefined)
      .eq("user_id", input.userId)
      .order("requested_at", { ascending: false })
      .order("id", { ascending: false });
    if (input.fromIso) q = q.gte("requested_at", input.fromIso);
    if (input.toIso) q = q.lt("requested_at", input.toIso);
    return q;
  });
  if (!read.ok) {
    if (isMissingPointsTable(read.error, "point_charge_requests")) {
      return { ok: true, summary: computePointChargeRequestPeriodSummary([]) };
    }
    return { ok: false, error: read.error };
  }
  return { ok: true, summary: computePointChargeRequestPeriodSummary(read.rows, read.count) };
}

/** 회원이 취소할 수 있는 대기 신청 수 — 기간과 무관 (「충전 요청 대기 n」 줄) */
export async function countCancellablePointChargeRequests(sb: SupabaseClient, userId: string): Promise<number | null> {
  const { count, error } = await sb
    .from("point_charge_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("request_status", [...POINT_CHARGE_PENDING_STATUSES]);
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
    /** `pending` 이면 충전 신청 목록은 기간 무시 대기 건만 (R6-e) */
    chargeStatus?: PointChargeRequestStatusFilter | null;
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
      status: input.chargeStatus ?? null,
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
