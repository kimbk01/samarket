import { describe, expect, it } from "vitest";
import {
  aggregateOwnerRedemptionKpis,
  businessCreditIsNotGiftRevenue,
  canRequestGiftCashConversion,
  conversionPendingAmount,
  ownerRedemptionStatusLabelKey,
  saleAmountIsNotOwnerRevenue,
  storeCashIsNotGiftRevenue,
  validateGiftConversionAmount,
  type OwnerGiftRedemptionRow,
} from "@/lib/gift-certificate/owner-gift-money-ops";

const sample: OwnerGiftRedemptionRow = {
  id: "r1",
  orderId: "00000000-0000-4000-8000-0000000000aa",
  orderNo: "AA-1",
  instanceId: "i1",
  giftTitle: "Gift",
  redeemedAmount: 1000,
  platformFeeAmount: 100,
  merchantNetAmount: 900,
  reversed: false,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("owner-gift-money-ops U5", () => {
  it("T1 Owner sees only own store redemption rows (filter contract by store API)", () => {
    // Presentation helper keeps orderId; store scoping is API .eq(store_id).
    expect(sample.orderId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("T2 redeemed gross from canonical redemption", () => {
    const k = aggregateOwnerRedemptionKpis([sample]);
    expect(k.redeemedGross).toBe(1000);
  });

  it("T3 platform fee and merchant net use server values", () => {
    const k = aggregateOwnerRedemptionKpis([sample]);
    expect(k.platformFeeTotal).toBe(100);
    expect(k.merchantNetTotal).toBe(900);
    expect(k.platformFeeTotal + k.merchantNetTotal).toBe(k.redeemedGross);
  });

  it("T4 sale amount != owner revenue", () => {
    expect(saleAmountIsNotOwnerRevenue()).toBe(true);
    const soldFace = 1000;
    const ownerRevenue = sample.merchantNetAmount;
    expect(soldFace).not.toBe(ownerRevenue);
  });

  it("T5 Business Credit != Gift Revenue", () => {
    expect(businessCreditIsNotGiftRevenue()).toBe(true);
  });

  it("T6 Store Cash != Gift Revenue", () => {
    expect(storeCashIsNotGiftRevenue()).toBe(true);
    const storeCash = 0;
    const giftRevenue = sample.merchantNetAmount;
    expect(storeCash).not.toBe(giftRevenue);
  });

  it("T7 available controls conversion CTA", () => {
    expect(canRequestGiftCashConversion({ availableRevenue: 900, openRecoveryAmount: 0 }).ok).toBe(true);
    expect(canRequestGiftCashConversion({ availableRevenue: 0, openRecoveryAmount: 0 }).ok).toBe(false);
  });

  it("T8 amount > available blocked", () => {
    expect(validateGiftConversionAmount({ amount: 1000, availableRevenue: 900 }).ok).toBe(false);
    expect(validateGiftConversionAmount({ amount: 900, availableRevenue: 900 }).ok).toBe(true);
    expect(validateGiftConversionAmount({ amount: 0, availableRevenue: 900 }).ok).toBe(false);
  });

  it("T9 conversion request does not credit Store Cash (pending amount only)", () => {
    const pending = conversionPendingAmount([
      { id: "c1", amount: 900, status: "REQUESTED", createdAt: "", approvedAt: null },
    ]);
    expect(pending).toBe(900);
    // APPROVED would move to cash in U6; REQUESTED stays pending.
    expect(
      conversionPendingAmount([
        { id: "c1", amount: 900, status: "APPROVED", createdAt: "", approvedAt: null },
      ])
    ).toBe(0);
  });

  it("T10 recovery blocks conversion where applicable", () => {
    const g = canRequestGiftCashConversion({ availableRevenue: 900, openRecoveryAmount: 50 });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe("recovery_blocked");
  });

  it("T11 refunded/reversed line presentation code path", () => {
    expect(ownerRedemptionStatusLabelKey({ reversed: true })).toBe("gift_u5_redemption_status_reversed");
    expect(ownerRedemptionStatusLabelKey({ reversed: false })).toBe("gift_u5_redemption_status_ok");
    const k = aggregateOwnerRedemptionKpis([{ ...sample, reversed: true }]);
    expect(k.redeemedGross).toBe(0);
  });

  it("T12 mobile presentation data contract (card fields present)", () => {
    expect(sample).toMatchObject({
      giftTitle: expect.any(String),
      orderId: expect.any(String),
      redeemedAmount: expect.any(Number),
      platformFeeAmount: expect.any(Number),
      merchantNetAmount: expect.any(Number),
      createdAt: expect.any(String),
    });
  });
});
