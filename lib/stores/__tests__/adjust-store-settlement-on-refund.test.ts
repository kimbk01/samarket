import { describe, expect, it, vi } from "vitest";
import { adjustStoreSettlementOnRefund } from "@/lib/stores/adjust-store-settlement-on-refund";

describe("adjustStoreSettlementOnRefund", () => {
  it("rejects partial refundAmount (PRODUCT LOCK NOT_SUPPORTED)", async () => {
    const update = vi.fn();
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
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
              error: null,
            }),
          }),
        }),
        update,
      }),
    };

    const result = await adjustStoreSettlementOnRefund(sb as any, {
      orderId: "ord-1",
      refundAmount: 200,
      note: "partial",
    });
    expect(result).toEqual({ ok: false, error: "partial_refund_not_supported" });
    expect(update).not.toHaveBeenCalled();
  });

  it("full refund consumes snapshotted platform fees and does not re-resolve policy", async () => {
    const update = vi.fn().mockReturnValue({
      eq: async () => ({ error: null }),
    });

    const sb = {
      from: (table: string) => {
        expect(table).toBe("store_settlements");
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
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
                error: null,
              }),
            }),
          }),
          update,
        };
      },
    };

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
