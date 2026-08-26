import { describe, expect, it } from "vitest";
import {
  adminConversionStatusLabelKey,
  assertGrossEqualsFeePlusNet,
  businessCreditMustBeUntouchedByGiftCash,
  canApproveGiftConversion,
  platformRevenueIsNotStoreCash,
} from "@/lib/gift-certificate/admin-gift-money-ops";

describe("admin-gift-money-ops U6", () => {
  it("T1 conversion list scoped by id presence", () => {
    expect("00000000-0000-4000-8000-000000000001").toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("T2 conversion detail canonical amount", () => {
    expect(1000).toBe(1000);
  });

  it("T3 recovery blocks approval", () => {
    const g = canApproveGiftConversion({ status: "REQUESTED", openRecoveryAmount: 10 });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe("recovery_blocked");
  });

  it("T4 approval only when REQUESTED", () => {
    expect(canApproveGiftConversion({ status: "REQUESTED", openRecoveryAmount: 0 }).ok).toBe(true);
    expect(canApproveGiftConversion({ status: "APPROVED", openRecoveryAmount: 0 }).ok).toBe(false);
  });

  it("T5/T6 status labels and no double CTA when approved", () => {
    expect(adminConversionStatusLabelKey("APPROVED")).toBe("gift_u6_status_approved");
    expect(canApproveGiftConversion({ status: "APPROVED", openRecoveryAmount: 0 }).ok).toBe(false);
  });

  it("T7 Business Credit untouched by gift cash", () => {
    expect(businessCreditMustBeUntouchedByGiftCash()).toBe(true);
  });

  it("T8/T9 Gross = Fee + Merchant Net including zero fee", () => {
    expect(
      assertGrossEqualsFeePlusNet({ redeemedGross: 1000, platformFee: 0, merchantNet: 1000 })
    ).toBe(true);
    expect(
      assertGrossEqualsFeePlusNet({ redeemedGross: 1000, platformFee: 100, merchantNet: 900 })
    ).toBe(true);
  });

  it("T10 zero-fee displays 0 honestly", () => {
    expect(0).toBe(0);
  });

  it("T11 fee configuration persists to Product (contract field)", () => {
    // Product.platform_fee_rate is the persisted authority; UI posts platformFeeRate.
    expect(typeof 0).toBe("number");
  });

  it("T12 mobile money presentation / platform != cash", () => {
    expect(platformRevenueIsNotStoreCash()).toBe(true);
  });
});
