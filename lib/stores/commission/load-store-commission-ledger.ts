/**
 * Store commission + Cash ledger readers — ONE server computation for Admin
 * (/admin/store-settlements) and Owner (/stores/owner/settlements).
 * Rows, states, totals and period balances are computed in SQL; this module only maps them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORE_COMMISSION_RPC,
  type BusinessCashLedgerKind,
  type StoreCashPosition,
  type StoreCommissionAdjustmentRecordDecision,
  type StoreCommissionAdjustmentStatus,
  type StoreCommissionChargeStage,
  type StoreCommissionLedgerFilterState,
  type StoreCommissionRowState,
  type StorePayoutClass,
} from "@/lib/stores/commission/store-commission-contract";
import { loadStoreCashPositions } from "@/lib/stores/commission/store-commission-writer";

export type StoreCommissionLedgerRow = {
  obligationId: string;
  orderId: string;
  orderNo: string;
  orderStatus: string;
  paymentMethod: string | null;
  storeId: string;
  storeName: string;
  chargeStage: StoreCommissionChargeStage;
  chargedAt: string;
  commissionBasePhp: number;
  feePercent: number | null;
  /** Frozen policy snapshot at charge time (null for legacy rows charged before snapshots). */
  feeBreakdown: {
    policyName: string | null;
    scope: string | null;
    percentFeePhp: number;
    fixedFeePhp: number;
    deliveryIncomePhp: number;
  } | null;
  /** Fee as charged (never rewritten by a refund). */
  feeChargedMinor: number;
  /** Paid from Cash and still kept by the platform. */
  feePaidMinor: number;
  feeOutstandingMinor: number;
  state: StoreCommissionRowState;
  adjustmentStatus: StoreCommissionAdjustmentStatus;
  adjustmentTrigger: "cancelled" | "refunded" | null;
  reviewFlaggedAt: string | null;
  decision: null | {
    id: string;
    decision: StoreCommissionAdjustmentRecordDecision;
    approvedMinor: number;
    cashRefundMinor: number;
    outstandingCancelMinor: number;
    reason: string;
    adminUserId: string | null;
    decidedAt: string;
  };
};

export type StoreCommissionLedgerSummary = {
  count: number;
  commissionBasePhp: number;
  feeChargedMinor: number;
  feePaidMinor: number;
  feeOutstandingMinor: number;
  cashRefundedMinor: number;
  outstandingCancelledMinor: number;
  /** charged − cash refunded − outstanding cancelled. */
  netCommissionMinor: number;
  reviewCount: number;
  reviewFeeMinor: number;
  /** charged = paid + outstanding + refunded + cancelled (computed in SQL). */
  reconciles: boolean;
};

export type StoreCommissionLedgerPage = {
  rows: StoreCommissionLedgerRow[];
  totalRows: number;
  summary: StoreCommissionLedgerSummary;
};

export type StoreCashLedgerRow = {
  id: string;
  storeId: string;
  storeName: string;
  kind: BusinessCashLedgerKind | string;
  direction: "credit" | "debit";
  amountMinor: number;
  balanceAfterMinor: number;
  relatedType: string;
  relatedId: string;
  orderId: string | null;
  actorType: string;
  createdAt: string;
};

export type StoreCashLedgerPage = {
  rows: StoreCashLedgerRow[];
  totalRows: number;
  openingMinor: number;
  closingMinor: number;
  creditMinor: number;
  debitMinor: number;
  byKind: Record<string, number>;
  /**
   * Stores whose live balance ≠ Σ ledger (balance changed outside the ledger in the past).
   * For these stores opening/closing (ledger sums) do not equal the account balance.
   */
  ledgerMismatchStoreIds: string[];
};

type Range = { fromIso: string | null; toIso: string | null };

function int(n: unknown): number {
  const v = Math.trunc(Number(n) || 0);
  return Number.isFinite(v) ? v : 0;
}

function num(n: unknown): number | null {
  if (n == null) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function snapString(v: unknown): string | null {
  return v == null || v === "" ? null : String(v);
}

function projectRow(r: Record<string, unknown>): StoreCommissionLedgerRow {
  const snap = (r.fee_snapshot ?? null) as Record<string, unknown> | null;
  const stage = String(r.charge_stage ?? "completed") as StoreCommissionChargeStage;
  return {
    obligationId: String(r.id),
    orderId: String(r.order_id),
    orderNo: String(r.order_no ?? "").trim() || String(r.order_id).slice(0, 8),
    orderStatus: String(r.order_status ?? ""),
    paymentMethod: r.buyer_payment_method ? String(r.buyer_payment_method) : null,
    storeId: String(r.store_id),
    storeName: String(r.store_name ?? ""),
    chargeStage: stage,
    chargedAt: String(r.created_at ?? ""),
    commissionBasePhp: int(r.confirmed_revenue_php),
    feePercent: num(snap?.fee_percent),
    feeBreakdown: snap
      ? {
          policyName: snapString(snap.policy_name ?? (snap.policy as Record<string, unknown> | undefined)?.policy_name),
          scope: snapString(snap.scope ?? (snap.policy as Record<string, unknown> | undefined)?.scope),
          percentFeePhp: int(snap.platform_fee_php),
          fixedFeePhp: int(snap.fixed_fee_php),
          deliveryIncomePhp: int(snap.delivery_income_php),
        }
      : null,
    feeChargedMinor: int(r.fee_charged),
    feePaidMinor: int(r.fee_paid_minor),
    feeOutstandingMinor: int(r.fee_outstanding_minor),
    state: String(r.state) as StoreCommissionRowState,
    adjustmentStatus: String(r.adjustment_status ?? "none") as StoreCommissionAdjustmentStatus,
    adjustmentTrigger:
      r.adjustment_trigger === "cancelled" || r.adjustment_trigger === "refunded" ? r.adjustment_trigger : null,
    reviewFlaggedAt: r.review_flagged_at ? String(r.review_flagged_at) : null,
    decision: r.adj_id
      ? {
          id: String(r.adj_id),
          decision: String(r.adj_decision) as StoreCommissionAdjustmentRecordDecision,
          approvedMinor: int(r.adj_approved),
          cashRefundMinor: int(r.adj_cash),
          outstandingCancelMinor: int(r.adj_cancel),
          reason: String(r.adj_reason ?? ""),
          adminUserId: r.adj_admin ? String(r.adj_admin) : null,
          decidedAt: String(r.adj_at ?? ""),
        }
      : null,
  };
}

function projectSummary(s: Record<string, unknown> | null | undefined): StoreCommissionLedgerSummary {
  const v = s ?? {};
  return {
    count: int(v.count),
    commissionBasePhp: int(v.commission_base_php),
    feeChargedMinor: int(v.fee_charged_minor),
    feePaidMinor: int(v.fee_paid_minor),
    feeOutstandingMinor: int(v.fee_outstanding_minor),
    cashRefundedMinor: int(v.cash_refunded_minor),
    outstandingCancelledMinor: int(v.outstanding_cancelled_minor),
    netCommissionMinor: int(v.net_commission_minor),
    reviewCount: int(v.review_count),
    reviewFeeMinor: int(v.review_fee_minor),
    reconciles: v.reconciles !== false,
  };
}

/** `storeIds = null` → every store (Admin only). */
export async function loadStoreCommissionLedgerPage(
  sb: SupabaseClient,
  input: Range & {
    storeIds: readonly string[] | null;
    state: StoreCommissionLedgerFilterState;
    orderNo: string | null;
    limit: number;
    offset: number;
  }
): Promise<StoreCommissionLedgerPage> {
  const { data, error } = await sb.rpc(STORE_COMMISSION_RPC.ledgerPage, {
    p_store_ids: input.storeIds ? [...input.storeIds] : null,
    p_from: input.fromIso,
    p_to: input.toIso,
    p_state: input.state,
    p_order_no: input.orderNo,
    p_limit: input.limit,
    p_offset: input.offset,
  });
  if (error) throw new Error(error.message);
  const body = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
  return {
    rows: rows.map(projectRow),
    totalRows: int(body.total),
    summary: projectSummary(body.summary as Record<string, unknown>),
  };
}

export async function loadStoreCashLedgerPage(
  sb: SupabaseClient,
  input: Range & {
    storeIds: readonly string[] | null;
    kinds: readonly string[];
    limit: number;
    offset: number;
  }
): Promise<StoreCashLedgerPage> {
  const { data, error } = await sb.rpc(STORE_COMMISSION_RPC.cashLedgerPage, {
    p_store_ids: input.storeIds ? [...input.storeIds] : null,
    p_from: input.fromIso,
    p_to: input.toIso,
    p_kinds: input.kinds.length ? [...input.kinds] : null,
    p_limit: input.limit,
    p_offset: input.offset,
  });
  if (error) throw new Error(error.message);
  const b = (data ?? {}) as Record<string, unknown>;
  const opening = int(b.opening_minor);
  const closing = int(b.closing_minor);
  const credit = int(b.credit_minor);
  const debit = int(b.debit_minor);
  const byKindRaw = (b.by_kind ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(b.rows) ? (b.rows as Record<string, unknown>[]) : [];
  return {
    rows: rows.map((r) => ({
      id: String(r.id),
      storeId: String(r.store_id),
      storeName: String(r.store_name ?? ""),
      kind: String(r.entry_kind),
      direction: r.direction === "credit" ? "credit" : "debit",
      amountMinor: int(r.amount_minor),
      balanceAfterMinor: int(r.balance_after_minor),
      relatedType: String(r.related_type ?? ""),
      relatedId: String(r.related_id ?? ""),
      orderId: r.order_id ? String(r.order_id) : null,
      actorType: String(r.actor_type ?? ""),
      createdAt: String(r.created_at ?? ""),
    })),
    totalRows: int(b.total),
    openingMinor: opening,
    closingMinor: closing,
    creditMinor: credit,
    debitMinor: debit,
    byKind: Object.fromEntries(Object.entries(byKindRaw).map(([k, v]) => [k, int(v)])),
    ledgerMismatchStoreIds: Array.isArray(b.ledger_mismatch_store_ids)
      ? (b.ledger_mismatch_store_ids as unknown[]).map(String)
      : [],
  };
}

export type StoreCommissionBreakdownRow = {
  bucket: string;
  label: string | null;
  count: number;
  commissionBasePhp: number;
  feeChargedMinor: number;
  feePaidMinor: number;
  feeOutstandingMinor: number;
  cashRefundedMinor: number;
  outstandingCancelledMinor: number;
  netCommissionMinor: number;
};

/** Day / month buckets are Asia/Manila calendar dates (computed in SQL). */
export async function loadStoreCommissionBreakdown(
  sb: SupabaseClient,
  input: Range & { storeIds: readonly string[] | null; group: "day" | "month" | "store" }
): Promise<StoreCommissionBreakdownRow[]> {
  const { data, error } = await sb.rpc(STORE_COMMISSION_RPC.breakdown, {
    p_store_ids: input.storeIds ? [...input.storeIds] : null,
    p_from: input.fromIso,
    p_to: input.toIso,
    p_group: input.group,
  });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return rows.map((r) => ({
    bucket: String(r.bucket ?? ""),
    label: r.label != null ? String(r.label) : null,
    count: int(r.count),
    commissionBasePhp: int(r.commission_base_php),
    feeChargedMinor: int(r.fee_charged_minor),
    feePaidMinor: int(r.fee_paid_minor),
    feeOutstandingMinor: int(r.fee_outstanding_minor),
    cashRefundedMinor: int(r.cash_refunded_minor),
    outstandingCancelledMinor: int(r.outstanding_cancelled_minor),
    netCommissionMinor: int(r.net_commission_minor),
  }));
}

export type StorePlatformPayableSummary = {
  orders: number;
  directCollectedPhp: number;
  platformHeldPhp: number;
  heldPaidByCoinPhp: number;
  /** Gift redemptions owed on the gift-certificate revenue rail — excluded from payable. */
  giftRailPhp: number;
  giftRailNetPhp: number;
  giftRailOrders: number;
  payablePhp: number;
  payableOrders: number;
  coinOverCredit: number;
  legacyOpenSettlementPhp: number;
  legacyOpenSettlementCount: number;
  legacyManualPaidPhp: number;
  legacyManualPaidCount: number;
};

export type StorePlatformPayableRow = {
  orderId: string;
  orderNo: string;
  storeId: string;
  storeName: string;
  createdAt: string;
  paymentMethod: string | null;
  directPhp: number;
  heldPhp: number;
  coinMinted: number;
  heldPaidByCoinPhp: number;
  giftRailPhp: number;
  payablePhp: number;
  coinOverCredit: number;
  legacySettlementStatus: string | null;
  legacyNetPhp: number;
  payoutClass: StorePayoutClass;
};

/** payable = this rail's obligations · exceptions = Coin over-credit / legacy manual payouts · all = every completed order. */
export type StorePayableView = "payable" | "exceptions" | "all";

export function parseStorePayableView(raw: string | null | undefined): StorePayableView {
  return raw === "all" || raw === "exceptions" ? raw : "payable";
}

export type StorePlatformPayablePage = {
  summary: StorePlatformPayableSummary;
  totalRows: number;
  rows: StorePlatformPayableRow[];
};

/** Completed orders classified by who holds the money (SQL `store_platform_payable_page`). */
export async function loadStorePlatformPayable(
  sb: SupabaseClient,
  input: Range & { storeIds: readonly string[] | null; view: StorePayableView; limit: number; offset: number }
): Promise<StorePlatformPayablePage> {
  const { data, error } = await sb.rpc(STORE_COMMISSION_RPC.payable, {
    p_store_ids: input.storeIds ? [...input.storeIds] : null,
    p_from: input.fromIso,
    p_to: input.toIso,
    p_view: input.view,
    p_limit: input.limit,
    p_offset: input.offset,
  });
  if (error) throw new Error(error.message);
  const b = (data ?? {}) as Record<string, unknown>;
  const s = (b.summary ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(b.rows) ? (b.rows as Record<string, unknown>[]) : [];
  return {
    summary: {
      orders: int(s.orders),
      directCollectedPhp: int(s.direct_collected_php),
      platformHeldPhp: int(s.platform_held_php),
      heldPaidByCoinPhp: int(s.held_paid_by_coin_php),
      giftRailPhp: int(s.gift_rail_php),
      giftRailNetPhp: int(s.gift_rail_net_php),
      giftRailOrders: int(s.gift_rail_orders),
      payablePhp: int(s.payable_php),
      payableOrders: int(s.payable_orders),
      coinOverCredit: int(s.coin_over_credit),
      legacyOpenSettlementPhp: int(s.legacy_open_settlement_php),
      legacyOpenSettlementCount: int(s.legacy_open_settlement_count),
      legacyManualPaidPhp: int(s.legacy_manual_paid_php),
      legacyManualPaidCount: int(s.legacy_manual_paid_count),
    },
    totalRows: int(b.total),
    rows: rows.map((r) => ({
      orderId: String(r.order_id),
      orderNo: String(r.order_no ?? ""),
      storeId: String(r.store_id),
      storeName: String(r.store_name ?? ""),
      createdAt: String(r.created_at ?? ""),
      paymentMethod: r.buyer_payment_method ? String(r.buyer_payment_method) : null,
      directPhp: int(r.direct_php),
      heldPhp: int(r.held_php),
      coinMinted: int(r.coin_minted),
      heldPaidByCoinPhp: int(r.held_paid_by_coin_php),
      giftRailPhp: int(r.gift_rail_php),
      payablePhp: int(r.payable_php),
      coinOverCredit: int(r.coin_over_credit),
      legacySettlementStatus: r.settlement_status ? String(r.settlement_status) : null,
      legacyNetPhp: int(r.legacy_net_php),
      payoutClass: String(r.class) as StorePayoutClass,
    })),
  };
}

export type StoreCommissionIntegrityReport = {
  obligations: number;
  checks: Record<string, { violations: number; ids: string[] }>;
  originalUnknown: { count: number; ids: string[] };
};

export async function loadStoreCommissionIntegrity(
  sb: SupabaseClient,
  storeIds: readonly string[] | null
): Promise<StoreCommissionIntegrityReport> {
  const { data, error } = await sb.rpc(STORE_COMMISSION_RPC.integrity, {
    p_store_ids: storeIds ? [...storeIds] : null,
  });
  if (error) throw new Error(error.message);
  const b = (data ?? {}) as Record<string, unknown>;
  const checks: StoreCommissionIntegrityReport["checks"] = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === "obligations" || k === "original_unknown" || !v || typeof v !== "object") continue;
    const c = v as { violations?: unknown; ids?: unknown };
    checks[k] = { violations: int(c.violations), ids: Array.isArray(c.ids) ? c.ids.map(String) : [] };
  }
  const ou = (b.original_unknown ?? {}) as { count?: unknown; ids?: unknown };
  return {
    obligations: int(b.obligations),
    checks,
    originalUnknown: { count: int(ou.count), ids: Array.isArray(ou.ids) ? ou.ids.map(String) : [] },
  };
}

/** Positions + names for the stores in scope (Admin overview / Owner header). */
/**
 * 관리자 전체 매장 캐시 현황 대상 — 승인 매장 + 캐시 계정이 있는 매장.
 * `/api/admin/store-commission-ledger`(「미납 관리」)와 통합 대시보드가 같은 집합을 쓴다.
 */
export async function loadAdminStoreCashOverviewIds(sb: SupabaseClient): Promise<string[]> {
  const [approved, accounts] = await Promise.all([
    sb.from("stores").select("id").eq("approval_status", "approved").limit(5000),
    sb.from("business_cash_accounts").select("store_id").limit(5000),
  ]);
  if (approved.error) throw new Error(approved.error.message);
  return [
    ...new Set([
      ...(approved.data ?? []).map((s) => String((s as { id: string }).id)),
      ...(accounts.data ?? []).map((a) => String((a as { store_id: string }).store_id)),
    ]),
  ];
}

export async function loadStoreCashOverview(
  sb: SupabaseClient,
  storeIds: readonly string[]
): Promise<{ positions: StoreCashPosition[]; storeNames: Record<string, string> }> {
  const ids = [...new Set(storeIds.map((s) => s.trim()).filter(Boolean))];
  if (!ids.length) return { positions: [], storeNames: {} };
  const [positions, names] = await Promise.all([
    loadStoreCashPositions(sb, ids),
    sb.from("stores").select("id, store_name").in("id", ids),
  ]);
  const storeNames: Record<string, string> = {};
  for (const s of (names.data ?? []) as Array<{ id: string; store_name?: string | null }>) {
    storeNames[String(s.id)] = String(s.store_name ?? "").trim();
  }
  return { positions: ids.map((id) => positions.get(id)!).filter(Boolean), storeNames };
}
