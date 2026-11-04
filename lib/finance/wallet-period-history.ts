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
import {
  pickLedgerChainLatest,
  sliceLedgerChainPage,
  type LedgerChainView,
} from "@/lib/finance/ledger-chain-order";

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
};

type Range = { fromIso: string | null; toIso: string | null };

/**
 * 기간 합계 = DB 집계 1회 (재감사 P-1 · `owner_wallet_period_summary` · 20271104180000).
 * 이전: 요청마다 기간 원장을 1,000줄씩 최대 5만 줄 읽어 여기서 합산(쪽·칸·알림마다 반복).
 * DB 는 종류(·방향)별 합과 시작·종료 경계의 같은 시각 줄 묶음만 준다 — 분류(`classifyCoinLedgerAmount`·`classifyCashPeriodRows`)와
 * 잔액 사슬 판정(`pickLedgerChainLatest` · R2)은 여기서 그대로 한다. 전량 합산이라 「일부만 합산」이 없다.
 */
export const OWNER_WALLET_PERIOD_SUMMARY_RPC = "owner_wallet_period_summary" as const;

type RpcBoundaryRow = { id?: string; created_at?: string; signed?: number | string; balance_after?: number | string };
type RpcKindSum = { entry_kind?: string; direction?: string | null; count?: number | string; signed?: number | string; abs?: number | string };
type RpcWalletSummary = {
  row_count?: number | string;
  sums_by_kind?: RpcKindSum[];
  close_group?: RpcBoundaryRow[];
  close_prev_group?: RpcBoundaryRow[];
  open_group?: RpcBoundaryRow[];
  open_prev_group?: RpcBoundaryRow[];
  withdrawal_paid?: number | string | null;
};

const boundaryView = (r: RpcBoundaryRow): LedgerChainView => ({
  createdAt: String(r.created_at ?? ""),
  signed: Math.trunc(Number(r.signed) || 0),
  balanceAfter: Math.trunc(Number(r.balance_after) || 0),
});

/** 경계 묶음(같은 시각 줄 전부)의 사슬 마지막 줄 잔액 — 앞 묶음의 마지막 잔액을 시작점으로. 묶음이 없으면 null. */
export function chainLatestBalance(group: readonly RpcBoundaryRow[], prevGroup: readonly RpcBoundaryRow[]): number | null {
  if (group.length === 0) return null;
  const prev = prevGroup.length ? pickLedgerChainLatest(prevGroup, boundaryView) : null;
  const latest = pickLedgerChainLatest(group, boundaryView, prev ? boundaryView(prev).balanceAfter : null);
  return latest ? boundaryView(latest).balanceAfter : null;
}

async function loadWalletPeriodSums(
  sb: SupabaseClient,
  storeId: string,
  wallet: WalletKind,
  range: Range
): Promise<RpcWalletSummary | null> {
  const { data, error } = await sb.rpc(OWNER_WALLET_PERIOD_SUMMARY_RPC, {
    p_store_id: storeId,
    p_wallet: wallet,
    p_from: range.fromIso,
    p_to: range.toIso,
  });
  if (error || !data || typeof data !== "object") return null;
  return data as RpcWalletSummary;
}

/** 시작 잔액(시작 전 마지막 줄 · 기간 시작이 없으면 0)·종료 잔액(기간 마지막 줄 · 없으면 시작 잔액) */
function openingClosing(r: RpcWalletSummary, fromIso: string | null): { opening: number; closing: number } {
  const opening = fromIso ? chainLatestBalance(r.open_group ?? [], r.open_prev_group ?? []) ?? 0 : 0;
  const closing = chainLatestBalance(r.close_group ?? [], r.close_prev_group ?? []) ?? opening;
  return { opening, closing };
}

export async function loadCoinPeriodSummary(
  sb: SupabaseClient,
  storeId: string,
  range: Range
): Promise<CoinPeriodSummary | null> {
  const r = await loadWalletPeriodSums(sb, storeId, "coin", range);
  if (!r) return null;
  // 종류별 합 = 줄마다 분류해 더한 값과 같다(분류가 종류 안에서 금액에 비례 — classifyCoinLedgerAmount)
  const sums = sumCoinLedgerContributions(
    (r.sums_by_kind ?? []).map((k) => ({ entryKind: String(k.entry_kind ?? ""), amount: Math.trunc(Number(k.signed) || 0) }))
  );
  const { opening, closing } = openingClosing(r, range.fromIso);
  const expected =
    opening + sums.earned - sums.converted - sums.withdrawn - sums.reversed + sums.adjusted + sums.other;
  return {
    wallet: "coin",
    opening,
    closing,
    sums,
    withdrawalPaid: r.withdrawal_paid == null ? null : Math.trunc(Number(r.withdrawal_paid) || 0),
    rowCount: Math.trunc(Number(r.row_count) || 0),
    reconciled: expected === closing,
  };
}

/** Cash 종류별 분류 — `loadStoreStatement` 와 같은 규칙 + 나머지 종류도 숨기지 않고 other 로. */
export function classifyCashPeriodRows(
  rows: ReadonlyArray<{ entryKind: string; direction: string; amountMinor: number }>
): Omit<CashPeriodSummary, "wallet" | "openingMinor" | "closingMinor" | "rowCount" | "reconciled"> {
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
  const r = await loadWalletPeriodSums(sb, storeId, "cash", range);
  if (!r) return null;
  // 종류·방향별 합(절댓값)을 한 줄처럼 넘긴다 — classifyCashPeriodRows 는 줄마다 |금액| 을 더하므로 같은 결과
  const s = classifyCashPeriodRows(
    (r.sums_by_kind ?? []).map((k) => ({
      entryKind: String(k.entry_kind ?? ""),
      direction: String(k.direction ?? ""),
      amountMinor: Math.trunc(Number(k.abs) || 0),
    }))
  );
  const { opening: openingMinor, closing: closingMinor } = openingClosing(r, range.fromIso);
  return {
    wallet: "cash",
    openingMinor,
    closingMinor,
    ...s,
    rowCount: Math.trunc(Number(r.row_count) || 0),
    reconciled: openingMinor + s.creditMinor - s.debitMinor === closingMinor,
  };
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
  // 같은 조건(매장·기간·종류) — 창 조회와 경계 묶음 조회가 같은 조건을 쓴다
  const scoped = (q: ReturnType<ReturnType<typeof sb.from>["select"]>) => {
    let out = q.eq("store_id", input.storeId);
    if (input.range.fromIso) out = out.gte("created_at", input.range.fromIso);
    if (input.range.toIso) out = out.lt("created_at", input.range.toIso);
    if (input.kinds && input.kinds.length > 0) out = out.in("entry_kind", [...input.kinds]);
    return out;
  };
  const { data, error, count } = await scoped(sb.from(table).select(cols, { count: "exact" }))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) return null;
  const raw = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const view = isCoin ? COIN_SPEC.view : CASH_SPEC.view;
  const pageRawOrNull = await sliceLedgerChainPage({
    windowRows: raw,
    windowStart: from,
    windowFull: raw.length === to - from + 1,
    offset: input.offset,
    limit: input.limit,
    view,
    loadGroup: async (createdAt) => {
      const [g, newer] = await Promise.all([
        scoped(sb.from(table).select(cols))
          .eq("created_at", createdAt)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
        scoped(sb.from(table).select("id", { count: "exact", head: true })).gt("created_at", createdAt),
      ]);
      if (g.error || newer.error) return null;
      return { rows: (g.data ?? []) as unknown as Array<Record<string, unknown>>, newerCount: newer.count ?? 0 };
    },
  });
  if (!pageRawOrNull) return null;
  const pageRaw = pageRawOrNull;
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
