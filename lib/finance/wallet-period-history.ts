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

export type WalletKind = "coin" | "cash";

/** 합계 칸 → 목록 거르기 (칸을 누르면 그 종류만). */
export const COIN_CATEGORY_KINDS = {
  earned: ["SALE_EARN", "GIFT_REDEMPTION_EARN", "ECONOMIC_INFLOW"],
  converted: ["CONVERT_TO_BUSINESS_CASH"],
  withdrawn: ["WITHDRAWAL_REQUEST", "WITHDRAWAL_RELEASE", "WITHDRAWAL_REJECT", "WITHDRAWAL_COMPLETE"],
  reversed: ["REVERSAL"],
  adjusted: ["ADMIN_ADJUST"],
} as const;
export type CoinCategory = keyof typeof COIN_CATEGORY_KINDS;

export const CASH_CATEGORY_KINDS = {
  topup: ["TOP_UP"],
  fromConversion: ["CONVERT_FROM_STORE_POINTS"],
  saleFee: ["SALE_FEE", "SALE_FEE_SETTLEMENT", "SALE_FEE_REVERSAL"],
  ads: ["AD_SPEND", "AD_REFUND", "PARTNER_SPEND", "PARTNER_REFUND"],
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

async function balanceBefore(
  sb: SupabaseClient,
  table: string,
  col: string,
  storeId: string,
  fromIso: string | null
): Promise<number> {
  if (!fromIso) return 0;
  const { data } = await sb
    .from(table)
    .select(col)
    .eq("store_id", storeId)
    .lt("created_at", fromIso)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Math.trunc(Number((data as Record<string, unknown> | null)?.[col]) || 0);
}

export async function loadCoinPeriodSummary(
  sb: SupabaseClient,
  storeId: string,
  range: Range
): Promise<CoinPeriodSummary | null> {
  const [opening, all, paid] = await Promise.all([
    balanceBefore(sb, STORE_ECONOMIC_POINT_LEDGER_TABLE, "balance_after", storeId, range.fromIso),
    fetchAllPeriodRows<{ entry_kind?: string; amount?: number; balance_after?: number }>(
      sb,
      STORE_ECONOMIC_POINT_LEDGER_TABLE,
      "id, entry_kind, amount, balance_after",
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
  if (all.error) return null;
  const sums = sumCoinLedgerContributions(
    all.rows.map((r) => ({ entryKind: String(r.entry_kind ?? ""), amount: Math.trunc(Number(r.amount) || 0) }))
  );
  const last = all.rows[all.rows.length - 1];
  const closing = last ? Math.trunc(Number(last.balance_after) || 0) : opening;
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
    balanceBefore(sb, BUSINESS_CASH_LEDGER_TABLE, "balance_after_minor", storeId, range.fromIso),
    fetchAllPeriodRows<{ entry_kind?: string; direction?: string; amount_minor?: number; balance_after_minor?: number }>(
      sb,
      BUSINESS_CASH_LEDGER_TABLE,
      "id, entry_kind, direction, amount_minor, balance_after_minor",
      storeId,
      range
    ),
  ]);
  if (all.error) return null;
  const s = classifyCashPeriodRows(
    all.rows.map((r) => ({
      entryKind: String(r.entry_kind ?? ""),
      direction: String(r.direction ?? ""),
      amountMinor: Math.trunc(Number(r.amount_minor) || 0),
    }))
  );
  const last = all.rows[all.rows.length - 1];
  const closingMinor = last ? Math.trunc(Number(last.balance_after_minor) || 0) : openingMinor;
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
};

export async function loadWalletHistoryPage(
  sb: SupabaseClient,
  input: { storeId: string; wallet: WalletKind; range: Range; kinds: readonly string[] | null; offset: number; limit: number }
): Promise<{ rows: WalletHistoryRow[]; total: number } | null> {
  const table = input.wallet === "coin" ? STORE_ECONOMIC_POINT_LEDGER_TABLE : BUSINESS_CASH_LEDGER_TABLE;
  const cols =
    input.wallet === "coin"
      ? "id, entry_kind, amount, balance_after, related_type, related_id, created_at"
      : "id, entry_kind, direction, amount_minor, balance_after_minor, related_type, related_id, created_at";
  let q = sb.from(table).select(cols, { count: "exact" }).eq("store_id", input.storeId);
  if (input.range.fromIso) q = q.gte("created_at", input.range.fromIso);
  if (input.range.toIso) q = q.lt("created_at", input.range.toIso);
  if (input.kinds && input.kinds.length > 0) q = q.in("entry_kind", [...input.kinds]);
  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(input.offset, input.offset + input.limit - 1);
  if (error) return null;
  const raw = (data ?? []) as unknown as Array<Record<string, unknown>>;
  let rows: WalletHistoryRow[] = raw.map((r) => {
    const isCoin = input.wallet === "coin";
    const amt = Math.trunc(Number(isCoin ? r.amount : r.amount_minor) || 0);
    const debit = !isCoin && String(r.direction ?? "").toLowerCase() !== "credit";
    return {
      id: String(r.id ?? ""),
      entryKind: String(r.entry_kind ?? ""),
      signedAmount: isCoin ? amt : debit ? -Math.abs(amt) : Math.abs(amt),
      balanceAfter: Math.trunc(Number(isCoin ? r.balance_after : r.balance_after_minor) || 0),
      relatedType: r.related_type == null ? null : String(r.related_type),
      relatedId: r.related_id == null ? null : String(r.related_id),
      createdAt: String(r.created_at ?? ""),
    };
  });
  if (input.wallet === "coin") {
    // 연결 번호 통일 (관리자·사장님 같은 번호 · 54701b8e9)
    rows = rows.map((r) => canonicalCoinConversionLink(r));
    await linkCoinWithdrawalRequestRows(sb, rows);
  }
  return { rows, total: count ?? rows.length };
}
