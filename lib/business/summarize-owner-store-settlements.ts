import type { OwnerStoreSettlementRow } from "@/lib/business/owner-store-settlement-types";
import {
  summarizeStoreOrderFinancialFacts,
  type StoreOrderFinancialSummary,
} from "@/lib/stores/store-order-financial-fact";

export type OwnerStoreSettlementSummary = {
  gross: number;
  platformFee: number;
  /** @deprecated use platformFee for display of recognized revenue */
  deliveryIncome: number;
  refund: number;
  pendingNet: number;
  paidNet: number;
  count: number;
  commissionReversal: number;
  platformCommissionRevenue: number;
};

/**
 * Prefer server `summary` from GET /api/me/store-settlements.
 * This helper remains for tests / fallback — MUST use same definitions as summarizeStoreOrderFinancialFacts.
 */
export function summarizeOwnerStoreSettlements(
  rows: OwnerStoreSettlementRow[]
): OwnerStoreSettlementSummary {
  const facts = rows.map((r) => ({
    settlement_id: r.id,
    order_id: r.order_id,
    order_no: r.order_no,
    store_id: r.store_id,
    store_name: r.store_name,
    buyer_user_id: null,
    buyer_display: null,
    ordered_at: null,
    completed_at: null,
    order_status: null,
    payment_status: null,
    settlement_status: String(r.settlement_status ?? ""),
    settlement_due_date: r.settlement_due_date ?? null,
    settlement_created_at: r.created_at,
    paid_at: r.paid_at,
    gross_amount: Number(r.gross_amount) || 0,
    discount_amount: Number(r.discount_amount ?? 0) || 0,
    point_amount: Number(r.point_amount ?? 0) || 0,
    delivery_fee_amount: Number(r.delivery_fee_amount ?? 0) || 0,
    payment_amount: Number(r.payment_amount ?? r.gross_amount) || 0,
    commission_base_amount: Number(r.commission_base_amount ?? r.gross_amount) || 0,
    commission_rate: Number(r.platform_fee_percent ?? 0) || 0,
    commission_amount: Number(r.platform_fee_amount ?? 0) || 0,
    fixed_fee_amount: Number(r.fixed_fee_amount ?? 0) || 0,
    delivery_income_amount: Number(r.delivery_income_amount ?? 0) || 0,
    discount_burden_amount: 0,
    commission_reversal_amount: Number(r.commission_reversal_amount ?? 0) || 0,
    platform_commission_revenue:
      Number(r.platform_commission_revenue ?? 0) ||
      Math.max(
        0,
        (Number(r.platform_fee_amount ?? 0) || 0) +
          (Number(r.fixed_fee_amount ?? 0) || 0) +
          (Number(r.delivery_income_amount ?? 0) || 0) -
          (Number(r.commission_reversal_amount ?? 0) || 0)
      ),
    refund_amount: Number(r.refund_amount ?? 0) || 0,
    net_settlement_amount: Number(r.net_settlement_amount ?? r.settlement_amount) || 0,
    applied_fee_policy_id: null,
    applied_fee_policy_snapshot: null,
    commission_policy_scope: null,
    hold_reason: r.hold_reason,
    payout_method: r.payout_method ?? null,
    payout_reference: r.payout_reference ?? null,
    payout_confirmed_at: r.payout_confirmed_at ?? null,
    payout_note: r.payout_note ?? null,
  }));

  const s = summarizeStoreOrderFinancialFacts(facts);
  return mapFinancialSummaryToOwner(s);
}

export function mapFinancialSummaryToOwner(s: StoreOrderFinancialSummary): OwnerStoreSettlementSummary {
  return {
    gross: s.gross,
    platformFee: s.platform_commission_revenue,
    deliveryIncome: 0,
    refund: s.refund,
    pendingNet: s.pending_net,
    paidNet: s.paid_net,
    count: s.order_count,
    commissionReversal: s.commission_reversal,
    platformCommissionRevenue: s.platform_commission_revenue,
  };
}
