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
      row({ settlement_status: "scheduled", net_settlement_amount: 500 }),
      row({ settlement_status: "paid", net_settlement_amount: 300 }),
    ]);
    expect(s.pendingNet).toBe(500);
    expect(s.paidNet).toBe(300);
    expect(s.count).toBe(2);
  });
});
