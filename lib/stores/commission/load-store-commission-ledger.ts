/**
 * Store commission ledger — ONE loader for Admin (/admin/store-settlements) and
 * Owner (/stores/owner/settlements). Same rows, same summary, same labels.
 * Source of truth: store_sale_fee_obligations (+ business_cash_accounts for position).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveStoreCommissionRowState,
  type StoreCashPosition,
  type StoreCommissionAdjustmentStatus,
  type StoreCommissionChargeStage,
  type StoreCommissionRowState,
} from "@/lib/stores/commission/store-commission-contract";
import { loadStoreCashPositions, selectAllPages } from "@/lib/stores/commission/store-commission-writer";

export const STORE_COMMISSION_LEDGER_SCAN_LIMIT = 5000;
const IN_CHUNK = 150;

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
  cashRefundedMinor: number;
  outstandingCancelledMinor: number;
  state: StoreCommissionRowState;
  adjustmentStatus: StoreCommissionAdjustmentStatus;
  adjustmentTrigger: "cancelled" | "refunded" | null;
  reviewFlaggedAt: string | null;
  adjustmentNote: string | null;
  adjustedAt: string | null;
};

export type StoreCommissionLedgerSummary = {
  count: number;
  commissionBasePhp: number;
  feeChargedMinor: number;
  feePaidMinor: number;
  feeOutstandingMinor: number;
  cashRefundedMinor: number;
  outstandingCancelledMinor: number;
  /** charged − refunded − cancelled = platform commission revenue. */
  netCommissionMinor: number;
  reviewCount: number;
  reviewFeeMinor: number;
  /** charged = paid + outstanding + refunded + cancelled (rows with a known charge). */
  reconciles: boolean;
};

export type StoreCommissionLedgerFilter = {
  storeIds: readonly string[];
  from?: string | null;
  to?: string | null;
  state?: StoreCommissionRowState | "all" | null;
  orderNo?: string | null;
  limit?: number;
  offset?: number;
};

export type StoreCommissionLedgerResult = {
  rows: StoreCommissionLedgerRow[];
  totalRows: number;
  summary: StoreCommissionLedgerSummary;
  positions: StoreCashPosition[];
  storeNames: Record<string, string>;
  truncated: boolean;
};

type ObligationDbRow = {
  id: string;
  store_id: string;
  order_id: string;
  confirmed_revenue_php: number | null;
  fee_due_minor: number | null;
  fee_paid_minor: number | null;
  fee_outstanding_minor: number | null;
  status: string;
  created_at: string;
  charge_stage?: string | null;
  fee_snapshot?: Record<string, unknown> | null;
  adjustment_status?: string | null;
  adjustment_trigger?: string | null;
  review_flagged_at?: string | null;
  adjustment_note?: string | null;
  adjusted_at?: string | null;
  adjustment_cash_refunded_minor?: number | null;
  adjustment_outstanding_cancelled_minor?: number | null;
  original_fee_due_minor?: number | null;
};

const OBLIGATION_SELECT =
  "id, store_id, order_id, confirmed_revenue_php, fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, created_at, charge_stage, fee_snapshot, adjustment_status, adjustment_trigger, review_flagged_at, adjustment_note, adjusted_at, adjustment_cash_refunded_minor, adjustment_outstanding_cancelled_minor, original_fee_due_minor";

function int(n: unknown): number {
  const v = Math.trunc(Number(n) || 0);
  return Number.isFinite(v) ? v : 0;
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function dayStartIso(day: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00.000Z` : null;
}

function dayEndIso(day: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T23:59:59.999Z` : null;
}

function normalizeAdjustment(raw: unknown): StoreCommissionAdjustmentStatus {
  return raw === "review_required" || raw === "refunded" || raw === "kept" ? raw : "none";
}

export function projectStoreCommissionRow(
  r: ObligationDbRow,
  order: { order_no?: string | null; order_status?: string | null; buyer_payment_method?: string | null } | undefined,
  storeName: string
): StoreCommissionLedgerRow {
  const adjustmentStatus = normalizeAdjustment(r.adjustment_status);
  const feePaidMinor = int(r.fee_paid_minor);
  const feeOutstandingMinor = int(r.fee_outstanding_minor);
  const cashRefundedMinor = int(r.adjustment_cash_refunded_minor);
  const outstandingCancelledMinor = int(r.adjustment_outstanding_cancelled_minor);
  const feeChargedMinor =
    r.original_fee_due_minor != null
      ? int(r.original_fee_due_minor)
      : int(r.fee_due_minor) + cashRefundedMinor + outstandingCancelledMinor;
  const snap = (r.fee_snapshot ?? null) as Record<string, unknown> | null;
  const feePercentRaw = snap?.fee_percent;
  return {
    obligationId: String(r.id),
    orderId: String(r.order_id),
    orderNo: String(order?.order_no ?? "").trim() || String(r.order_id).slice(0, 8),
    orderStatus: String(order?.order_status ?? ""),
    paymentMethod: order?.buyer_payment_method ? String(order.buyer_payment_method) : null,
    storeId: String(r.store_id),
    storeName,
    chargeStage: r.charge_stage === "preparing" ? "preparing" : "completed",
    chargedAt: String(r.created_at),
    commissionBasePhp: int(r.confirmed_revenue_php),
    feePercent: feePercentRaw == null ? null : Number(feePercentRaw) || 0,
    feeChargedMinor,
    feePaidMinor,
    feeOutstandingMinor,
    cashRefundedMinor,
    outstandingCancelledMinor,
    state: resolveStoreCommissionRowState({ status: r.status, adjustmentStatus, feeOutstandingMinor }),
    adjustmentStatus,
    adjustmentTrigger:
      r.adjustment_trigger === "cancelled" || r.adjustment_trigger === "refunded" ? r.adjustment_trigger : null,
    reviewFlaggedAt: r.review_flagged_at ?? null,
    adjustmentNote: r.adjustment_note ?? null,
    adjustedAt: r.adjusted_at ?? null,
  };
}

export function summarizeStoreCommissionRows(rows: readonly StoreCommissionLedgerRow[]): StoreCommissionLedgerSummary {
  const s: StoreCommissionLedgerSummary = {
    count: rows.length,
    commissionBasePhp: 0,
    feeChargedMinor: 0,
    feePaidMinor: 0,
    feeOutstandingMinor: 0,
    cashRefundedMinor: 0,
    outstandingCancelledMinor: 0,
    netCommissionMinor: 0,
    reviewCount: 0,
    reviewFeeMinor: 0,
    reconciles: true,
  };
  for (const r of rows) {
    s.commissionBasePhp += r.commissionBasePhp;
    s.feeChargedMinor += r.feeChargedMinor;
    s.feePaidMinor += r.feePaidMinor;
    s.feeOutstandingMinor += r.feeOutstandingMinor;
    s.cashRefundedMinor += r.cashRefundedMinor;
    s.outstandingCancelledMinor += r.outstandingCancelledMinor;
    if (r.state === "review_required") {
      s.reviewCount += 1;
      s.reviewFeeMinor += r.feeChargedMinor;
    }
  }
  s.netCommissionMinor = s.feeChargedMinor - s.cashRefundedMinor - s.outstandingCancelledMinor;
  s.reconciles =
    s.feeChargedMinor ===
    s.feePaidMinor + s.feeOutstandingMinor + s.cashRefundedMinor + s.outstandingCancelledMinor;
  return s;
}

export async function loadStoreCommissionLedger(
  sb: SupabaseClient,
  filter: StoreCommissionLedgerFilter
): Promise<StoreCommissionLedgerResult> {
  const storeIds = [...new Set(filter.storeIds.map((s) => s.trim()).filter(Boolean))];
  const emptySummary = summarizeStoreCommissionRows([]);
  if (!storeIds.length) {
    return { rows: [], totalRows: 0, summary: emptySummary, positions: [], storeNames: {}, truncated: false };
  }

  const fromIso = filter.from ? dayStartIso(filter.from) : null;
  const toIso = filter.to ? dayEndIso(filter.to) : null;

  const dbRows: ObligationDbRow[] = [];
  for (const part of chunk(storeIds, IN_CHUNK)) {
    const pageRows = await selectAllPages<ObligationDbRow>((from, to) => {
      let q = sb
        .from("store_sale_fee_obligations")
        .select(OBLIGATION_SELECT)
        .in("store_id", part)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
      if (fromIso) q = q.gte("created_at", fromIso);
      if (toIso) q = q.lte("created_at", toIso);
      return q.range(from, to);
    }, STORE_COMMISSION_LEDGER_SCAN_LIMIT);
    dbRows.push(...pageRows);
  }
  dbRows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const truncated = dbRows.length >= STORE_COMMISSION_LEDGER_SCAN_LIMIT;
  const scanned = dbRows.slice(0, STORE_COMMISSION_LEDGER_SCAN_LIMIT);

  const orderIds = [...new Set(scanned.map((r) => String(r.order_id)))];
  const orders = new Map<string, { order_no?: string | null; order_status?: string | null; buyer_payment_method?: string | null }>();
  for (const part of chunk(orderIds, IN_CHUNK)) {
    const { data } = await sb
      .from("store_orders")
      .select("id, order_no, order_status, buyer_payment_method")
      .in("id", part);
    for (const o of (data ?? []) as Array<{ id: string; order_no?: string; order_status?: string; buyer_payment_method?: string }>) {
      orders.set(String(o.id), o);
    }
  }

  const names = new Map<string, string>();
  for (const part of chunk(storeIds, IN_CHUNK)) {
    const { data } = await sb.from("stores").select("id, store_name").in("id", part);
    for (const s of (data ?? []) as Array<{ id: string; store_name?: string | null }>) {
      names.set(String(s.id), String(s.store_name ?? "").trim());
    }
  }

  let projected = scanned.map((r) =>
    projectStoreCommissionRow(r, orders.get(String(r.order_id)), names.get(String(r.store_id)) ?? "")
  );
  const state = filter.state && filter.state !== "all" ? filter.state : null;
  if (state) projected = projected.filter((r) => r.state === state);
  const orderNo = String(filter.orderNo ?? "").trim().toLowerCase();
  if (orderNo) projected = projected.filter((r) => r.orderNo.toLowerCase().includes(orderNo));

  const positionsMap = await loadStoreCashPositions(sb, storeIds);
  const offset = Math.max(0, Math.trunc(filter.offset ?? 0));
  const limit = Math.min(500, Math.max(1, Math.trunc(filter.limit ?? 100)));

  return {
    rows: projected.slice(offset, offset + limit),
    totalRows: projected.length,
    summary: summarizeStoreCommissionRows(projected),
    positions: storeIds.map((id) => positionsMap.get(id)!).filter(Boolean),
    storeNames: Object.fromEntries(names),
    truncated,
  };
}
