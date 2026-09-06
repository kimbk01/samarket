import { describe, expect, it } from "vitest";
import {
  classifySettlementOpsBucket,
  groupSettlementsByDayStore,
  groupSettlementsByStore,
  sortSettlementOpsRows,
  summarizeSettlementOps,
} from "@/lib/admin/settlement-control/aggregate-settlement-ops";

const base = {
  platform_fee_amount: 10,
  fixed_fee_amount: 5,
  refund_amount: 0,
  commission_reversal_amount: 0,
  net_settlement_amount: 85,
  settlement_amount: 85,
  settlement_due_date: "2026-09-10",
  paid_at: null as string | null,
  hold_reason: null as string | null,
};

describe("settlement ops aggregate", () => {
  it("classifies held as problem and scheduled as needs_action", () => {
    expect(classifySettlementOpsBucket("held")).toBe("problem");
    expect(classifySettlementOpsBucket("scheduled")).toBe("needs_action");
    expect(classifySettlementOpsBucket("paid")).toBe("paid");
  });

  it("groups by day+store without recalculating fees", () => {
    const rows = [
      {
        id: "1",
        store_id: "s1",
        store_name: "A",
        order_id: "o1",
        order_no: "1",
        gross_amount: 100,
        settlement_status: "scheduled",
        created_at: "2026-09-06T10:00:00.000Z",
        ...base,
      },
      {
        id: "2",
        store_id: "s1",
        store_name: "A",
        order_id: "o2",
        order_no: "2",
        gross_amount: 50,
        settlement_status: "held",
        created_at: "2026-09-06T12:00:00.000Z",
        ...base,
        hold_reason: "refund review",
        platform_fee_amount: 5,
        fixed_fee_amount: 0,
        net_settlement_amount: 45,
      },
    ];
    const daily = groupSettlementsByDayStore(rows);
    expect(daily).toHaveLength(1);
    expect(daily[0]!.orderCount).toBe(2);
    expect(daily[0]!.platformFee).toBe(20);
    expect(daily[0]!.problemCount).toBe(1);
    expect(daily[0]!.primaryStatus).toBe("problem");

    const stores = groupSettlementsByStore(rows);
    expect(stores[0]!.gross).toBe(150);

    const sorted = sortSettlementOpsRows(rows);
    expect(sorted[0]!.settlement_status).toBe("held");

    const sum = summarizeSettlementOps(rows);
    expect(sum.problemCount).toBe(1);
    expect(sum.needsActionCount).toBe(1);
  });
});
