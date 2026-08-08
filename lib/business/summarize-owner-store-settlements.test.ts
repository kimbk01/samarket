import { describe, expect, it } from "vitest";
import { summarizeOwnerStoreSettlements } from "./summarize-owner-store-settlements";
import type { OwnerStoreSettlementRow } from "./owner-store-settlement-types";

function row(partial: Partial<OwnerStoreSettlementRow> & Pick<OwnerStoreSettlementRow, "settlement_status">) {
  return {
    id: "1",
    store_id: "s",
    store_name: "매장",
    order_id: "o",
    order_no: "1",
    gross_amount: 1000,
    fee_amount: 100,
    settlement_amount: 900,
    net_settlement_amount: 900,
    settlement_due_date: "2026-05-20",
    paid_at: null,
    hold_reason: null,
    created_at: "2026-05-20",
    ...partial,
  } as OwnerStoreSettlementRow;
}

describe("summarizeOwnerStoreSettlements", () => {
  it("splits pending and paid net", () => {
    const s = summarizeOwnerStoreSettlements([
      row({
        settlement_status: "scheduled",
        net_settlement_amount: 500,
        platform_fee_amount: 50,
        platform_commission_revenue: 50,
      }),
      row({
        settlement_status: "paid",
        net_settlement_amount: 300,
        platform_fee_amount: 30,
        platform_commission_revenue: 30,
      }),
    ]);
    expect(s.pendingNet).toBe(500);
    expect(s.paidNet).toBe(300);
    expect(s.count).toBe(2);
    expect(s.platformCommissionRevenue).toBe(80);
  });

  it("uses recognized platform revenue after reversal", () => {
    const s = summarizeOwnerStoreSettlements([
      row({
        settlement_status: "cancelled",
        gross_amount: 1000,
        platform_fee_amount: 65,
        commission_reversal_amount: 65,
        platform_commission_revenue: 0,
        refund_amount: 1000,
        net_settlement_amount: 0,
      }),
    ]);
    expect(s.platformFee).toBe(0);
    expect(s.refund).toBe(1000);
  });
});
