import type { OwnerStoreSettlementRow } from "@/lib/business/owner-store-settlement-types";

export type OwnerStoreSettlementSummary = {
  gross: number;
  platformFee: number;
  deliveryIncome: number;
  refund: number;
  pendingNet: number;
  paidNet: number;
  count: number;
};

export function summarizeOwnerStoreSettlements(
  rows: OwnerStoreSettlementRow[]
): OwnerStoreSettlementSummary {
  let gross = 0;
  let platformFee = 0;
  let deliveryIncome = 0;
  let refund = 0;
  let pendingNet = 0;
  let paidNet = 0;
  for (const r of rows) {
    gross += Number(r.gross_amount) || 0;
    platformFee +=
      (Number(r.platform_fee_amount ?? 0) || 0) + (Number(r.fixed_fee_amount ?? 0) || 0);
    deliveryIncome += Number(r.delivery_income_amount ?? 0) || 0;
    refund += Number(r.refund_amount ?? 0) || 0;
    const net = Number(r.net_settlement_amount ?? r.settlement_amount) || 0;
    const st = String(r.settlement_status ?? "");
    if (st === "paid") paidNet += net;
    else if (st === "scheduled" || st === "processing" || st === "held") pendingNet += net;
  }
  return {
    gross,
    platformFee,
    deliveryIncome,
    refund,
    pendingNet,
    paidNet,
    count: rows.length,
  };
}
