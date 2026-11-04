/**
 * 매장 Coin·Cash 기간 내역 — 기간 합계(서버, 기간 전체) + 페이지 목록. 사장님·관리자 매장 명세 공용 (Owner 2026-11-03).
 *
 * - 합계는 고른 기간의 **모든** 원장 행으로 계산한다 (「최근 N건 기준」 폐지). 분류 규칙은 기존 단일 규칙
 *   (`classifyCoinLedgerAmount`, Cash 종류별 분류) 그대로 — 새 분류를 만들지 않는다.
 * - 항등식: closing = opening + Σ(기간 행) — 맞지 않으면 `reconciled=false` (화면이 「내역 합계가 맞지 않습니다」).
 * - 원장 데이터는 읽기만 한다.
 * @see docs/audit/currency-history-screens-design-2026-11-03.md
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUSINESS_CASH_LEDGER_TABLE,
  STORE_ECONOMIC_POINT_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import { sumCoinLedgerContributions, type CoinLedgerContribution } from "@/lib/stores/owner-finance-recent-window";
import { canonicalCoinConversionLink, linkCoinWithdrawalRequestRows } from "@/lib/finance/coin-ledger-link";
import { orderLedgerChainDesc, pickLedgerChainLatest, type LedgerChainView } from "@/lib/finance/ledger-chain-order";

export type WalletKind = "coin" | "cash";

/** 합계 칸 → 목록 거르기 (칸을 누르면 그 종류만). */
export const COIN_CATEGORY_KINDS = {
  earned: ["SALE_EARN", "GIFT_REDEMPTION_EARN", "ECONOMIC_INFLOW"],
  converted: ["CONVERT_TO_BUSINESS_CASH"],
  withdrawn: ["WITHDRAWAL_REQUEST", "WITHDRAWAL_RELEASE", "WITHDRAWAL_REJECT", "WITHDRAWAL_COMPLETE"],
  /** 「출금 지급 완료」 칸 — 지급 완료 줄만 (재감사 R3-d) */
  paid: ["WITHDRAWAL_COMPLETE"],
  reversed: ["REVERSAL"],
  adjusted: ["ADMIN_ADJUST"],
} as const;
export type CoinCategory = keyof typeof COIN_CATEGORY_KINDS;

export const CASH_CATEGORY_KINDS = {
  topup: ["TOP_UP"],
  fromConversion: ["CONVERT_FROM_STORE_POINTS"],
  saleFee: ["SALE_FEE", "SALE_FEE_SETTLEMENT", "SALE_FEE_REVERSAL"],
  /** 「광고 지출」 탭 전용 — 광고·Partner 지출·환불 전부 */
  ads: ["AD_SPEND", "AD_REFUND", "PARTNER_SPEND", "PARTNER_REFUND"],
  /** Cash 탭 칸별 거르기 — 세 칸이 같이 눌리지 않게 따로 (D-7) */
  adSpend: ["AD_SPEND"],
  partnerSpend: ["PARTNER_SPEND"],
  adRefund: ["AD_REFUND", "PARTNER_REFUND"],
  adjusted: ["ADMIN_ADJUST"],
} as const;
export type CashCategory = keyof typeof CASH_CATEGORY_KINDS;

export function categoryKinds(wallet: WalletKind, category: string | null | undefined): readonly string[] | null {
  const c = String(category ?? "").trim();
  if (!c) return null;
  const map = (wallet === "coin" ? COIN_CATEGORY_KINDS : CASH_CATEGORY_KINDS) as Record<string, readonly string[]>;
  return map[c] ?? null;
}

export type CoinPeriodSummary = {
  wallet: "coin";
  opening: number;
  closing: number;
  /** 양수 = 그 항목이 늘어남 (`classifyCoinLedgerAmount` 규칙). withdrawn = 순출금(신청 − 반려 환원). */
  sums: CoinLedgerContribution;
  /** 기간 안에 「지급 완료」된 출금 신청 금액 (coin_withdrawal_requests.paid_at 기준). null = 조회 실패. */
  withdrawalPaid: number | null;
  rowCount: number;
  reconciled: boolean;
  truncated: boolean;
};

export type CashPeriodSummary = {
  wallet: "cash";
  openingMinor: number;
  closingMinor: number;
  topupMinor: number;
  fromConversionMinor: number;
  /** 판매 수수료 차감 (SALE_FEE) */
  saleFeeMinor: number;
  /** 미납 수수료 납부 (SALE_FEE_SETTLEMENT) */
  outstandingCollectionMinor: number;
  /** 수수료 환급 (SALE_FEE_REVERSAL) */
  saleFeeReversalMinor: number;
  adSpendMinor: number;
  partnerSpendMinor: number;
  refundMinor: number;
  adjustmentCreditMinor: number;
  adjustmentDebitMinor: number;
  otherCreditMinor: number;
  otherDebitMinor: number;
  creditMinor: number;
  debitMinor: number;
  rowCount: number;
  reconciled: boolean;
  truncated: boolean;
};

const SUM_PAGE = 1000;
/** 기간 합계 안전 한도 — 넘으면 `truncated=true` (화면이 숨기지 않고 알린다). */
const SUM_MAX_ROWS = 50_000;

type Range = { fromIso: string | null; toIso: string | null };

async function fetchAllPeriodRows<T>(
  sb: SupabaseClient,
  table: string,
  cols: string,
  storeId: string,
  range: Range
): Promise<{ rows: T[]; truncated: boolean; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; from < SUM_MAX_ROWS; from += SUM_PAGE) {
    let q = sb.from(table).select(cols).eq("store_id", storeId);
    if (range.fromIso) q = q.gte("created_at", range.fromIso);
    if (range.toIso) q = q.lt("created_at", range.toIso);
    const { data, error } = await q
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + SUM_PAGE - 1);
    if (error) return { rows, truncated: false, error: error.message };
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < SUM_PAGE) return { rows, truncated: false, error: null };
  }
  return { rows, truncated: true, error: null };
}

type LedgerTableSpec = { table: string; cols: string; view: (r: Record<string, unknown>) => LedgerChainView };

const COIN_SPEC: LedgerTableSpec = {
  table: STORE_ECONOMIC_POINT_LEDGER_TABLE,
  cols: "id, amount, balance_after, created_at",
  view: (r) => ({
    createdAt: String(r.created_at ?? ""),
    signed: Math.trunc(Number(r.amount) || 0),
    balanceAfter: Math.trunc(Number(r.balance_after) || 0),
  }),
};

function cashSigned(r: Record<string, unknown>): number {
  const minor = Math.abs(Math.trunc(Number(r.amount_minor) || 0));
  return String(r.direction ?? "").toLowerCase() === "credit" ? minor : -minor;
}

const CASH_SPEC: LedgerTableSpec = {
  table: BUSINESS_CASH_LEDGER_TABLE,
  cols: "id, direction, amount_minor, balance_after_minor, created_at",
  view: (r) => ({
    createdAt: String(r.created_at ?? ""),
    signed: cashSigned(r),
    balanceAfter: Math.trunc(Number(r.balance_after_minor) || 0),
  }),
};

/**
 * 기간 시작 잔액 = 시작 전 마지막 줄의 잔액. 같은 시각 여러 줄은 잔액 사슬로 마지막 줄을 고른다(재감사 R2).
 * 조회 오류는 null (0 으로 숨기지 않음 · R8-e).
 */
async function balanceBefore(
  sb: SupabaseClient,
  spec: LedgerTableSpec,
  storeId: string,
  fromIso: string | null
): Promise<number | null> {
  if (!fromIso) return 0;
  const { data, error } = await sb
    .from(spec.table)
    .select(spec.cols)
    .eq("store_id", storeId)
    .lt("created_at", fromIso)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(20);
  if (error) return null;
  const latest = pickLedgerChainLatest((data ?? []) as unknown as Array<Record<string, unknown>>, spec.view);
  return latest ? spec.view(latest).balanceAfter : 0;
}

/** 기간 종료 잔액 — 기간 줄(오름차순)의 사슬 마지막 줄. 줄이 없으면 시작 잔액. */
function closingFromRows(rowsAsc: ReadonlyArray<Record<string, unknown>>, spec: LedgerTableSpec, opening: number): number {
  const latest = pickLedgerChainLatest([...rowsAsc].reverse(), spec.view, opening);
  return latest ? spec.view(latest).balanceAfter : opening;
}

export async function loadCoinPeriodSummary(
  sb: SupabaseClient,
  storeId: string,
  range: Range
): Promise<CoinPeriodSummary | null> {
  const [opening, all, paid] = await Promise.all([
    balanceBefore(sb, COIN_SPEC, storeId, range.fromIso),
    fetchAllPeriodRows<{ entry_kind?: string; amount?: number; balance_after?: number; created_at?: string }>(
      sb,
      STORE_ECONOMIC_POINT_LEDGER_TABLE,
      "id, entry_kind, amount, balance_after, created_at",
      storeId,
      range
    ),
    (async () => {
      let q = sb.from("coin_withdrawal_requests").select("amount").eq("store_id", storeId).eq("status", "PAID");
      if (range.fromIso) q = q.gte("paid_at", range.fromIso);
      if (range.toIso) q = q.lt("paid_at", range.toIso);
      const { data, error } = await q.limit(SUM_MAX_ROWS);
      if (error) return null;
      return ((data ?? []) as Array<{ amount?: number }>).reduce((s, r) => s + Math.trunc(Number(r.amount) || 0), 0);
    })(),
  ]);
  if (all.error || opening == null) return null;
  const sums = sumCoinLedgerContributions(
    all.rows.map((r) => ({ entryKind: String(r.entry_kind ?? ""), amount: Math.trunc(Number(r.amount) || 0) }))
  );
  const closing = closingFromRows(all.rows as unknown as Array<Record<string, unknown>>, COIN_SPEC, opening);
  const expected =
    opening + sums.earned - sums.converted - sums.withdrawn - sums.reversed + sums.adjusted + sums.other;
  return {
    wallet: "coin",
    opening,
    closing,
    sums,
    withdrawalPaid: paid,
    rowCount: all.rows.length,
    reconciled: all.truncated || expected === closing,
    truncated: all.truncated,
  };
}

/** Cash 종류별 분류 — `loadStoreStatement` 와 같은 규칙 + 나머지 종류도 숨기지 않고 other 로. */
export function classifyCashPeriodRows(
  rows: ReadonlyArray<{ entryKind: string; direction: string; amountMinor: number }>
): Omit<CashPeriodSummary, "wallet" | "openingMinor" | "closingMinor" | "rowCount" | "reconciled" | "truncated"> {
  const s = {
    topupMinor: 0,
    fromConversionMinor: 0,
    saleFeeMinor: 0,
    outstandingCollectionMinor: 0,
    saleFeeReversalMinor: 0,
    adSpendMinor: 0,
    partnerSpendMinor: 0,
    refundMinor: 0,
    adjustmentCreditMinor: 0,
    adjustmentDebitMinor: 0,
    otherCreditMinor: 0,
    otherDebitMinor: 0,
    creditMinor: 0,
    debitMinor: 0,
  };
  for (const r of rows) {
    const minor = Math.abs(Math.trunc(Number(r.amountMinor) || 0));
    const credit = String(r.direction ?? "").toLowerCase() === "credit";
    if (credit) s.creditMinor += minor;
    else s.debitMinor += minor;
    switch (r.entryKind) {
      case "TOP_UP":
        s.topupMinor += minor;
        break;
      case "CONVERT_FROM_STORE_POINTS":
        s.fromConversionMinor += minor;
        break;
      case "SALE_FEE":
        s.saleFeeMinor += minor;
        break;
      case "SALE_FEE_SETTLEMENT":
        s.outstandingCollectionMinor += minor;
        break;
      case "SALE_FEE_REVERSAL":
        s.saleFeeReversalMinor += minor;
        break;
      case "AD_SPEND":
        s.adSpendMinor += minor;
        break;
      case "PARTNER_SPEND":
        s.partnerSpendMinor += minor;
        break;
      case "AD_REFUND":
      case "PARTNER_REFUND":
        s.refundMinor += minor;
        break;
      case "ADMIN_ADJUST":
        if (credit) s.adjustmentCreditMinor += minor;
        else s.adjustmentDebitMinor += minor;
        break;
      default:
        if (credit) s.otherCreditMinor += minor;
        else s.otherDebitMinor += minor;
    }
  }
  return s;
}

export async function loadCashPeriodSummary(
  sb: SupabaseClient,
  storeId: string,
  range: Range
): Promise<CashPeriodSummary | null> {
  const [openingMinor, all] = await Promise.all([
    balanceBefore(sb, CASH_SPEC, storeId, range.fromIso),
    fetchAllPeriodRows<{
      entry_kind?: string;
      direction?: string;
      amount_minor?: number;
      balance_after_minor?: number;
      created_at?: string;
    }>(
      sb,
      BUSINESS_CASH_LEDGER_TABLE,
      "id, entry_kind, direction, amount_minor, balance_after_minor, created_at",
      storeId,
      range
    ),
  ]);
  if (all.error || openingMinor == null) return null;
  const s = classifyCashPeriodRows(
    all.rows.map((r) => ({
      entryKind: String(r.entry_kind ?? ""),
      direction: String(r.direction ?? ""),
      amountMinor: Math.trunc(Number(r.amount_minor) || 0),
    }))
  );
  const closingMinor = closingFromRows(all.rows as unknown as Array<Record<string, unknown>>, CASH_SPEC, openingMinor);
  return {
    wallet: "cash",
    openingMinor,
    closingMinor,
    ...s,
    rowCount: all.rows.length,
    reconciled: all.truncated || openingMinor + s.creditMinor - s.debitMinor === closingMinor,
    truncated: all.truncated,
  };
}

export type WalletHistoryRow = {
  id: string;
  entryKind: string;
  /** Coin: 부호 있는 정수 · Cash: 부호 있는 센타보 (debit = 음수) */
  signedAmount: number;
  balanceAfter: number;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
  /** Coin 출금 지급 완료 줄 — 원장 금액은 0(이미 신청 때 빠짐), 지급액은 meta.amount (재감사 R3-e) */
  referenceAmount?: number | null;
  /** Cash 수수료 줄(SALE_FEE·SALE_FEE_SETTLEMENT·SALE_FEE_REVERSAL) — 원장 meta.order_id 의 주문번호 (D-6). 없으면 생략. */
  orderNo?: string | null;
};

/** 주문번호를 붙이는 Cash 수수료 줄 종류 (정산 화면 `order_no=` 링크 · D-6) */
export const CASH_SALE_FEE_ENTRY_KINDS: readonly string[] = CASH_CATEGORY_KINDS.saleFee;

/** 원장 meta 에서 주문 id (문자) — 없으면 null */
export function ledgerMetaOrderId(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>).order_id;
  const id = typeof v === "string" ? v.trim() : "";
  return id || null;
}

/**
 * 이 쪽의 Cash 수수료 줄에 주문번호를 붙인다 — 이 쪽 줄의 주문 id 만 한 번에 조회 (D-6).
 * 조회 실패·없는 주문은 주문번호 없이 둔다(줄은 그대로 · 링크만 정산 첫 화면).
 */
async function attachCashFeeOrderNos(
  sb: SupabaseClient,
  storeId: string,
  rows: WalletHistoryRow[],
  orderIdByRowId: ReadonlyMap<string, string>
): Promise<WalletHistoryRow[]> {
  const ids = [...new Set(orderIdByRowId.values())];
  if (ids.length === 0) return rows;
  const { data, error } = await sb.from("store_orders").select("id, order_no").eq("store_id", storeId).in("id", ids);
  if (error) return rows;
  const noById = new Map<string, string>();
  for (const o of (data ?? []) as Array<{ id?: string; order_no?: string | null }>) {
    const no = String(o.order_no ?? "").trim();
    if (o.id && no) noById.set(String(o.id), no);
  }
  return rows.map((r) => {
    const oid = orderIdByRowId.get(r.id);
    const no = oid ? noById.get(oid) : undefined;
    return no ? { ...r, orderNo: no } : r;
  });
}

/** 페이지 경계에 같은 시각 묶음이 걸릴 때를 위해 앞뒤로 더 읽고 사슬 정렬 후 자른다 (재감사 R2). */
const PAGE_CHAIN_MARGIN = 8;

export async function loadWalletHistoryPage(
  sb: SupabaseClient,
  input: { storeId: string; wallet: WalletKind; range: Range; kinds: readonly string[] | null; offset: number; limit: number }
): Promise<{ rows: WalletHistoryRow[]; total: number } | null> {
  const isCoin = input.wallet === "coin";
  const table = isCoin ? STORE_ECONOMIC_POINT_LEDGER_TABLE : BUSINESS_CASH_LEDGER_TABLE;
  const cols = isCoin
    ? "id, entry_kind, amount, balance_after, related_type, related_id, created_at, meta"
    : "id, entry_kind, direction, amount_minor, balance_after_minor, related_type, related_id, created_at, meta";
  const from = Math.max(0, input.offset - PAGE_CHAIN_MARGIN);
  const to = input.offset + input.limit - 1 + PAGE_CHAIN_MARGIN;
  let q = sb.from(table).select(cols, { count: "exact" }).eq("store_id", input.storeId);
  if (input.range.fromIso) q = q.gte("created_at", input.range.fromIso);
  if (input.range.toIso) q = q.lt("created_at", input.range.toIso);
  if (input.kinds && input.kinds.length > 0) q = q.in("entry_kind", [...input.kinds]);
  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) return null;
  const raw = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const ordered = orderLedgerChainDesc(raw, isCoin ? COIN_SPEC.view : CASH_SPEC.view);
  const pageRaw = ordered.slice(input.offset - from, input.offset - from + input.limit);
  let rows: WalletHistoryRow[] = pageRaw.map((r) => {
    const amt = Math.trunc(Number(isCoin ? r.amount : r.amount_minor) || 0);
    const entryKind = String(r.entry_kind ?? "");
    const meta = r.meta && typeof r.meta === "object" ? (r.meta as Record<string, unknown>) : null;
    const metaAmount = Math.trunc(Number(meta?.amount) || 0);
    return {
      id: String(r.id ?? ""),
      entryKind,
      signedAmount: isCoin ? amt : cashSigned(r),
      balanceAfter: Math.trunc(Number(isCoin ? r.balance_after : r.balance_after_minor) || 0),
      relatedType: r.related_type == null ? null : String(r.related_type),
      relatedId: r.related_id == null ? null : String(r.related_id),
      createdAt: String(r.created_at ?? ""),
      ...(isCoin && entryKind === "WITHDRAWAL_COMPLETE" && metaAmount > 0 ? { referenceAmount: metaAmount } : {}),
    };
  });
  if (isCoin) {
    // 연결 번호 통일 (관리자·사장님 같은 번호 · 54701b8e9)
    rows = rows.map((r) => canonicalCoinConversionLink(r));
    await linkCoinWithdrawalRequestRows(sb, rows);
  } else {
    const orderIdByRowId = new Map<string, string>();
    for (const r of pageRaw) {
      if (!CASH_SALE_FEE_ENTRY_KINDS.includes(String(r.entry_kind ?? ""))) continue;
      const oid = ledgerMetaOrderId(r.meta);
      if (oid) orderIdByRowId.set(String(r.id ?? ""), oid);
    }
    rows = await attachCashFeeOrderNos(sb, input.storeId, rows, orderIdByRowId);
  }
  return { rows, total: count ?? rows.length };
}
