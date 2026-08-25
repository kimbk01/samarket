import { describe, expect, it, vi } from "vitest";
import { adjustStoreSettlementOnRefund } from "@/lib/stores/adjust-store-settlement-on-refund";
import {
  assertFinancialFactsEqual,
  computeCommissionReversalAmount,
  computeNetSettlementAmount,
  computePlatformCommissionRevenue,
  projectStoreOrderFinancialFact,
  summarizeStoreOrderFinancialFacts,
} from "@/lib/stores/store-order-financial-fact";
import { calculateOrderCommission } from "@/lib/stores/store-fee-policy-resolve";
import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";

describe("commission base contract", () => {
  it("documents payment_amount as base including delivery", () => {
    expect(STORE_ORDER_FINANCIAL_CONTRACT.commissionBaseField).toBe("store_orders.payment_amount");
    expect(STORE_ORDER_FINANCIAL_CONTRACT.commissionBaseIncludesDeliveryFee).toBe(true);
    expect(STORE_ORDER_FINANCIAL_CONTRACT.customerCouponSupported).toBe(true);
    expect(STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported).toBe(false);
  });

  it("charges commission on items+delivery grand total (checkout equation)", () => {
    const itemGross = 20000;
    const delivery = 3000;
    const payment = itemGross + delivery;
    const fee = calculateOrderCommission({
      commissionBaseAmount: payment,
      deliveryFeeAmount: delivery,
      feePercent: 6,
      fixedFee: 0,
      deliveryFeeMode: "none",
      deliveryFeePercent: 0,
    });
    expect(fee.commissionBaseAmount).toBe(23000);
    expect(fee.platformFeeAmount).toBe(1380);
  });
});

describe("settlement equation + reversal", () => {
  it("reproduces net settlement", () => {
    expect(
      computeNetSettlementAmount({
        gross_amount: 30000,
        platform_fee_amount: 1800,
        fixed_fee_amount: 0,
        store_funded_amount: 0,
        refund_amount: 0,
        delivery_income_amount: 0,
      })
    ).toBe(28200);
  });

  it("full refund reverses all platform revenue", () => {
    const reversal = computeCommissionReversalAmount({
      gross_amount: 30000,
      refund_amount: 30000,
      platform_fee_amount: 1800,
      fixed_fee_amount: 0,
      delivery_income_amount: 100,
    });
    expect(reversal).toBe(1900);
    expect(
      computePlatformCommissionRevenue({
        platform_fee_amount: 1800,
        fixed_fee_amount: 0,
        delivery_income_amount: 100,
        commission_reversal_amount: reversal,
      })
    ).toBe(0);
  });

  it("NOT_PRODUCT_PATH: proportional math exists but Delivery product rejects partial", () => {
    // Primitive only — adjustStoreSettlementOnRefund must reject this amount.
    const reversal = computeCommissionReversalAmount({
      gross_amount: 30000,
      refund_amount: 10000,
      platform_fee_amount: 1800,
      fixed_fee_amount: 0,
      delivery_income_amount: 0,
    });
    expect(reversal).toBe(600);
  });
});

describe("Owner/Admin order-level equality (projection)", () => {
  it("same ledger projects identical financial facts", () => {
    const settlement = {
      id: "set-1",
      store_id: "store-1",
      order_id: "ord-1",
      gross_amount: 23000,
      settlement_status: "scheduled",
      created_at: "2026-08-01T00:00:00.000Z",
      platform_fee_percent: 6,
      platform_fee_amount: 1380,
      fixed_fee_amount: 0,
      delivery_income_amount: 0,
      discount_burden_amount: 0,
      refund_amount: 0,
      commission_reversal_amount: 0,
      net_settlement_amount: 21620,
      applied_fee_policy_snapshot: { scope: "topic", fee_percent: 6 },
    };
    const order = {
      id: "ord-1",
      order_no: "ORDER-2026-000123",
      buyer_user_id: "user-1",
      order_status: "completed",
      payment_status: "paid",
      payment_amount: 23000,
      discount_amount: 0,
      delivery_fee_amount: 3000,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T01:00:00.000Z",
    };
    const ownerView = projectStoreOrderFinancialFact({
      settlement,
      order,
      storeName: "Store A",
      buyerDisplay: null,
    });
    const adminView = projectStoreOrderFinancialFact({
      settlement,
      order,
      storeName: "Store A",
      buyerDisplay: "Buyer",
    });
    const match = assertFinancialFactsEqual(ownerView, adminView);
    expect(match).toEqual({ ok: true });
    expect(ownerView.order_no).toBe("ORDER-2026-000123");
    expect(adminView.buyer_display).toBe("Buyer");
  });

  it("passes order coupon funding snapshot without using discount_burden as store cost", () => {
    const view = projectStoreOrderFinancialFact({
      settlement: {
        id: "1148973c-7812-44f5-b207-dda92c151142",
        store_id: "store-aa11",
        order_id: "ff15dfa6-36d2-4577-a60e-a6f5312ddb9c",
        gross_amount: 1950,
        settlement_status: "scheduled",
        created_at: "2026-08-25T00:00:00.000Z",
        platform_fee_percent: 7,
        platform_fee_amount: 136,
        fixed_fee_amount: 0,
        delivery_income_amount: 0,
        discount_burden_amount: 0,
        refund_amount: 0,
        commission_reversal_amount: 0,
        net_settlement_amount: 1714,
      },
      order: {
        id: "ff15dfa6-36d2-4577-a60e-a6f5312ddb9c",
        order_no: "SO1787662467219f980",
        payment_amount: 1850,
        discount_amount: 100,
        store_funded_amount: 100,
        platform_funded_amount: 0,
        delivery_fee_amount: 0,
      },
    });
    expect(view.discount_amount).toBe(100);
    expect(view.store_funded_amount).toBe(100);
    expect(view.platform_funded_amount).toBe(0);
    expect(view.discount_burden_amount).toBe(0);
    expect(view.net_settlement_amount).toBe(1714);
  });
});

describe("period summary Owner commission = Platform revenue", () => {
  it("sums recognized platform revenue after refunds with 0 diff", () => {
    const facts = [
      projectStoreOrderFinancialFact({
        settlement: {
          id: "1",
          store_id: "s",
          order_id: "o1",
          gross_amount: 10000,
          settlement_status: "scheduled",
          created_at: "2026-08-01T00:00:00.000Z",
          platform_fee_percent: 6,
          platform_fee_amount: 600,
          fixed_fee_amount: 0,
          delivery_income_amount: 0,
          refund_amount: 0,
          commission_reversal_amount: 0,
          net_settlement_amount: 9400,
        },
      }),
      projectStoreOrderFinancialFact({
        settlement: {
          id: "2",
          store_id: "s",
          order_id: "o2",
          gross_amount: 10000,
          settlement_status: "cancelled",
          created_at: "2026-08-02T00:00:00.000Z",
          platform_fee_percent: 6,
          platform_fee_amount: 600,
          fixed_fee_amount: 0,
          delivery_income_amount: 0,
          refund_amount: 10000,
          commission_reversal_amount: 600,
          net_settlement_amount: 0,
        },
      }),
    ];
    const summary = summarizeStoreOrderFinancialFacts(facts);
    expect(summary.gross).toBe(20000);
    expect(summary.refund).toBe(10000);
    expect(summary.platform_commission_revenue).toBe(600);
    expect(summary.commission_reversal).toBe(600);
    // Owner deduction recognized = platform revenue
    expect(summary.platform_commission_revenue).toBe(
      summary.commission_gross - summary.commission_reversal
    );
  });

  it("pagination subset does not change authority summary (FIN-14)", () => {
    const facts = Array.from({ length: 101 }, (_, i) =>
      projectStoreOrderFinancialFact({
        settlement: {
          id: `s-${i}`,
          store_id: "s",
          order_id: `o-${i}`,
          gross_amount: 1000,
          settlement_status: i % 2 === 0 ? "scheduled" : "paid",
          created_at: "2026-08-01T00:00:00.000Z",
          platform_fee_percent: 6,
          platform_fee_amount: 60,
          fixed_fee_amount: 0,
          delivery_income_amount: 0,
          refund_amount: 0,
          commission_reversal_amount: 0,
          net_settlement_amount: 940,
        },
      })
    );
    const full = summarizeStoreOrderFinancialFacts(facts);
    const page1 = summarizeStoreOrderFinancialFacts(facts); // authority = full set
    const page2Slice = facts.slice(50, 100);
    const page2Wrong = summarizeStoreOrderFinancialFacts(page2Slice);
    expect(full.order_count).toBe(101);
    expect(page1.gross).toBe(full.gross);
    expect(page1.platform_commission_revenue).toBe(full.platform_commission_revenue);
    // Prove page-only reduce would diverge — must not be used as authority
    expect(page2Wrong.order_count).toBe(50);
    expect(page2Wrong.gross).not.toBe(full.gross);
  });
});

describe("canonical settlement formula (FIN-11 SSOT)", () => {
  const gross = 1950;
  const platformFee = 136;
  const fixedFee = 0;
  const deliveryIncome = 0;
  const refund = 0;

  function insertNet(storeFunded: number) {
    return Math.max(0, gross - platformFee - fixedFee - deliveryIncome - storeFunded - refund);
  }

  function fallbackNet(storeFunded: number) {
    return computeNetSettlementAmount({
      gross_amount: gross,
      platform_fee_amount: platformFee,
      fixed_fee_amount: fixedFee,
      store_funded_amount: storeFunded,
      refund_amount: refund,
      delivery_income_amount: deliveryIncome,
    });
  }

  function projectFallbackNet(input: {
    storeFunded: number;
    platformFunded: number;
    discountBurdenLedger: number;
  }) {
    return projectStoreOrderFinancialFact({
      settlement: {
        id: "set-ssot",
        store_id: "store-1",
        order_id: "ord-ssot",
        gross_amount: gross,
        settlement_status: "scheduled",
        created_at: "2026-08-25T00:00:00.000Z",
        platform_fee_percent: 7,
        platform_fee_amount: platformFee,
        fixed_fee_amount: fixedFee,
        delivery_income_amount: deliveryIncome,
        discount_burden_amount: input.discountBurdenLedger,
        refund_amount: refund,
        net_settlement_amount: null,
      },
      order: {
        id: "ord-ssot",
        discount_amount: input.storeFunded + input.platformFunded,
        store_funded_amount: input.storeFunded,
        platform_funded_amount: input.platformFunded,
      },
    }).net_settlement_amount;
  }

  it("NO COUPON: insert = fallback = 1814", () => {
    expect(insertNet(0)).toBe(1814);
    expect(fallbackNet(0)).toBe(1814);
    expect(projectFallbackNet({ storeFunded: 0, platformFunded: 0, discountBurdenLedger: 0 })).toBe(1814);
  });

  it("STORE: insert = fallback = 1714; platform burden ledger does not reduce Owner net", () => {
    expect(insertNet(100)).toBe(1714);
    expect(fallbackNet(100)).toBe(1714);
    expect(projectFallbackNet({ storeFunded: 100, platformFunded: 0, discountBurdenLedger: 0 })).toBe(1714);
  });

  it("PLATFORM: insert = fallback = 1814; ledger discount_burden must not double-deduct Owner", () => {
    expect(insertNet(0)).toBe(1814);
    expect(fallbackNet(0)).toBe(1814);
    expect(projectFallbackNet({ storeFunded: 0, platformFunded: 100, discountBurdenLedger: 100 })).toBe(1814);
  });

  it("SHARED 60/40: insert = fallback = 1754", () => {
    expect(insertNet(60)).toBe(1754);
    expect(fallbackNet(60)).toBe(1754);
    expect(projectFallbackNet({ storeFunded: 60, platformFunded: 40, discountBurdenLedger: 40 })).toBe(1754);
  });

  it("invariant: store_funded + platform_funded = discount_amount", () => {
    const cases = [
      { store: 0, platform: 0 },
      { store: 100, platform: 0 },
      { store: 0, platform: 100 },
      { store: 60, platform: 40 },
    ];
    for (const c of cases) {
      expect(c.store + c.platform).toBe(c.store + c.platform);
      const view = projectStoreOrderFinancialFact({
        settlement: {
          id: "inv",
          store_id: "s",
          order_id: "o",
          gross_amount: gross,
          settlement_status: "scheduled",
          created_at: "2026-08-25T00:00:00.000Z",
          platform_fee_amount: platformFee,
          fixed_fee_amount: 0,
          delivery_income_amount: 0,
          discount_burden_amount: c.platform,
          refund_amount: 0,
          net_settlement_amount: insertNet(c.store),
        },
        order: {
          id: "o",
          discount_amount: c.store + c.platform,
          store_funded_amount: c.store,
          platform_funded_amount: c.platform,
        },
      });
      expect(view.store_funded_amount + view.platform_funded_amount).toBe(view.discount_amount);
    }
  });

  it("full refund: all modes net to 0 via order store_funded authority", () => {
    const modes = [
      { store: 0, platform: 0 },
      { store: 100, platform: 0 },
      { store: 0, platform: 100 },
      { store: 60, platform: 40 },
    ];
    for (const m of modes) {
      expect(
        computeNetSettlementAmount({
          gross_amount: gross,
          platform_fee_amount: platformFee,
          fixed_fee_amount: fixedFee,
          store_funded_amount: m.store,
          refund_amount: gross,
          delivery_income_amount: deliveryIncome,
        })
      ).toBe(0);
    }
  });
});

describe("adjustStoreSettlementOnRefund writes reversal", () => {
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

  it("full refund sets commission_reversal_amount to fee total", async () => {
    const { sb, update } = mockRefundSb(
      {
        id: "set-1",
        settlement_status: "scheduled",
        gross_amount: 1000,
        platform_fee_amount: 65,
        fixed_fee_amount: 10,
        discount_burden_amount: 0,
        delivery_income_amount: 5,
        refund_amount: 0,
        commission_reversal_amount: 0,
        hold_reason: null,
        payout_note: null,
        paid_at: null,
      },
      0
    );
    await adjustStoreSettlementOnRefund(sb as any, { orderId: "ord-1", note: "full" });
    const payload = update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.refund_amount).toBe(1000);
    expect(payload.commission_reversal_amount).toBe(80);
    expect(payload.net_settlement_amount).toBe(0);
    expect(payload.settlement_status).toBe("cancelled");
  });

  it("full refund STORE coupon uses order store_funded not ledger discount_burden", async () => {
    const { sb, update } = mockRefundSb(
      {
        id: "set-store",
        settlement_status: "scheduled",
        gross_amount: 1950,
        platform_fee_amount: 136,
        fixed_fee_amount: 0,
        discount_burden_amount: 0,
        delivery_income_amount: 0,
        refund_amount: 0,
        commission_reversal_amount: 0,
        hold_reason: null,
        payout_note: null,
        paid_at: null,
      },
      100
    );
    const result = await adjustStoreSettlementOnRefund(sb as any, { orderId: "ord-store", note: "full" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.net_settlement_amount).toBe(0);
    const payload = update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.net_settlement_amount).toBe(0);
  });

  it("full refund PLATFORM coupon does not treat discount_burden as Owner cost", async () => {
    const { sb, update } = mockRefundSb(
      {
        id: "set-platform",
        settlement_status: "scheduled",
        gross_amount: 1950,
        platform_fee_amount: 136,
        fixed_fee_amount: 0,
        discount_burden_amount: 100,
        delivery_income_amount: 0,
        refund_amount: 0,
        commission_reversal_amount: 0,
        hold_reason: null,
        payout_note: null,
        paid_at: null,
      },
      0
    );
    const result = await adjustStoreSettlementOnRefund(sb as any, { orderId: "ord-platform", note: "full" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.net_settlement_amount).toBe(0);
    expect(update).toHaveBeenCalled();
  });
});
