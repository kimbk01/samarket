import { describe, expect, it, vi } from "vitest";

/**
 * Settlement ensure must skip fee re-resolve when a row already exists (INV-08).
 */
describe("ensureStoreSettlementForCompletedOrder immutability", () => {
  it("does not update fee columns when settlement already exists", async () => {
    const update = vi.fn();
    const insert = vi.fn().mockResolvedValue({ error: null });

    const sb = {
      from: (table: string) => {
        if (table === "store_orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "ord-1",
                    store_id: "store-1",
                    order_status: "completed",
                    payment_amount: 1000,
                    delivery_fee_amount: 0,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "store_settlements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "set-1",
                    settlement_status: "scheduled",
                    applied_fee_policy_id: "pol-old",
                    platform_fee_percent: 6.5,
                  },
                  error: null,
                }),
              }),
            }),
            update,
            insert,
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const { ensureStoreSettlementForCompletedOrder } = await import(
      "@/lib/stores/ensure-store-settlement"
    );
    await ensureStoreSettlementForCompletedOrder(sb as any, "ord-1");

    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
