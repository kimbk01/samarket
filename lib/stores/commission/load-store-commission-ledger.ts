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
