import { describe, expect, it, vi } from "vitest";
import { adjustStoreSettlementOnRefund } from "@/lib/stores/adjust-store-settlement-on-refund";

function mockRefundSb(settlement: Record<string, unknown>, storeFunded = 0) {
  const update = vi.fn().mockReturnValue({
    eq: async () => ({ error: null }),
  });
  const sb = {
    from: (table: string) => {
      if (table === "store_settlements") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: settlement, error: null }),
            }),
          }),
          update,
        };
      }
      if (table === "store_orders") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { store_funded_amount: storeFunded },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { sb, update };
}

describe("adjustStoreSettlementOnRefund", () => {
  it("rejects partial refundAmount (PRODUCT LOCK NOT_SUPPORTED)", async () => {
    const { sb, update } = mockRefundSb(
      {
        id: "set-1",
        settlement_status: "scheduled",
        gross_amount: 1000,
        platform_fee_amount: 65,
        fixed_fee_amount: 0,
        discount_burden_amount: 0,
        delivery_income_amount: 0,
        refund_amount: 0,
        commission_reversal_amount: 0,
        hold_reason: null,
        payout_note: null,
        paid_at: null,
      },
      0
    );

    const result = await adjustStoreSettlementOnRefund(sb as any, {
      orderId: "ord-1",
      refundAmount: 200,
      note: "partial",
    });
    expect(result).toEqual({ ok: false, error: "partial_refund_not_supported" });
    expect(update).not.toHaveBeenCalled();
  });

  it("full refund consumes snapshotted platform fees and does not re-resolve policy", async () => {
    const { sb, update } = mockRefundSb(
      {
        id: "set-1",
        settlement_status: "scheduled",
        gross_amount: 1000,
        platform_fee_amount: 65,
        fixed_fee_amount: 0,
        discount_burden_amount: 0,
        delivery_income_amount: 0,
        refund_amount: 0,
        commission_reversal_amount: 0,
        hold_reason: null,
        payout_note: null,
        paid_at: null,
      },
      0
    );

    const result = await adjustStoreSettlementOnRefund(sb as any, {
      orderId: "ord-1",
      refundAmount: undefined,
      note: "full",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.refund_amount).toBe(1000);
      expect(result.commission_reversal_amount).toBe(65);
      expect(result.net_settlement_amount).toBe(0);
    }

    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.refund_amount).toBe(1000);
    expect(payload.commission_reversal_amount).toBe(65);
    expect(payload.net_settlement_amount).toBe(0);
    expect(payload.settlement_amount).toBe(0);
    expect(payload.settlement_status).toBe("cancelled");
    expect(payload).not.toHaveProperty("platform_fee_percent");
    expect(payload).not.toHaveProperty("platform_fee_amount");
  });
});
