import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";
import {
  PAID_VOUCHER_IMPLEMENTATION_BLOCKED,
  isPaidCouponTypeForbidden,
} from "@/lib/stores/store-coupon-ssot";
import {
  GIFT_AFTER_COUPON_IN_CHECKOUT_CALC,
  GIFT_BALANCE_EXPIRY_DISABLED,
  GIFT_BUSINESS_CREDIT_FIELD,
  GIFT_DIRECT_GCASH_BANK_PURCHASE_DISABLED,
  GIFT_FORBIDDEN_BALANCE_AUTHORITIES,
  GIFT_FULLY_REDEEMED_DELETE_FORBIDDEN,
  GIFT_FULLY_REDEEMED_HISTORY_RETAINED,
  GIFT_INSTANCE_EXPIRY_DISABLED,
  GIFT_IS_NOT_COUPON,
  GIFT_IS_NOT_DISCOUNT,
  GIFT_MAX_CERTIFICATES_PER_ORDER_INITIAL,
  GIFT_ORDER_PARTIAL_REFUND_SUPPORTED,
  GIFT_ORDER_SETTLEMENT_TABLE,
  GIFT_OWNER_REVENUE_RECOGNITION,
  GIFT_PLATFORM_FEE_RECOGNITION,
  GIFT_POINT_P2P_DISABLED,
  GIFT_PURCHASE_PAYMENT_RAIL,
  GIFT_REDEMPTION_ORDER_RELATION_ALLOWS_1_TO_N,
  GIFT_REVENUE_STATUS_IS_LEDGER_PROJECTION,
  GIFT_SALE_TIME_OWNER_REVENUE_FORBIDDEN,
  GIFT_TRANSFERABLE_DEFAULT,
  STORE_CASH_EXTERNAL_PAYOUT_IN_GIFT_SCOPE,
  STORE_CASH_NEGATIVE_BALANCE_FORBIDDEN,
  assertGiftMoneyInt,
  canTransitionGiftTransfer,
  computeCheckoutLayersBeforeAndAfterGift,
  computeGiftPlatformFeeAndMerchantNet,
  computeGiftRedemptionSplit,
  computeStoreCashRefundShortfall,
  evaluateGiftFriendEligibility,
  giftContractForbidsCouponPaidTypes,
  giftContractKeepsCheckoutDpointFalse,
  giftInstanceAllowsRedeem,
  giftInstanceAllowsRegift,
  giftPendingBlocksRedeem,
  giftPendingBlocksRegift,
  giftProductHasForbiddenExpiryField,
  isIssuedGiftInstanceStillValidAfterSalesEnd,
  ownerRevenueAtSaleTime,
  resolveGiftInstanceStatusAfterRedeem,
  senderRetainsAuthorityAfterAccept,
  storeCashConversionApprovalAllowed,
  validateGiftProductFunding,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";

const CONTRACT_SRC = readFileSync(
  resolve(process.cwd(), "lib/gift-certificate/gift-certificate-domain-contract.ts"),
  "utf8"
);

describe("G1 Paid Gift domain contract", () => {
  // T1
  it("T1 Coupon != Gift", () => {
    expect(GIFT_IS_NOT_COUPON).toBe(true);
    expect(GIFT_IS_NOT_DISCOUNT).toBe(true);
    expect(giftContractForbidsCouponPaidTypes()).toBe(true);
    expect(PAID_VOUCHER_IMPLEMENTATION_BLOCKED).toBe(true);
    expect(isPaidCouponTypeForbidden("paid")).toBe(true);
    expect(isPaidCouponTypeForbidden("voucher")).toBe(true);
    expect(isPaidCouponTypeForbidden("fixed_amount")).toBe(false);
    // Gift must not introduce a Coupon discount_type enum value.
    expect(CONTRACT_SRC).not.toMatch(/export type StoreCouponDiscountType/);
    expect(CONTRACT_SRC).not.toMatch(/["']gift["']\s*as\s*const.*discount|discountType:\s*["']gift["']/);
  });

  // T2
  it("T2 Paid Gift has no value expiry", () => {
    expect(GIFT_INSTANCE_EXPIRY_DISABLED).toBe(false);
    expect(GIFT_BALANCE_EXPIRY_DISABLED).toBe(true);
    expect(giftProductHasForbiddenExpiryField({ expiresAt: "2099-01-01" })).toBe(true);
    expect(giftProductHasForbiddenExpiryField({})).toBe(false);
    expect(
      isIssuedGiftInstanceStillValidAfterSalesEnd({
        salesEndsAt: "2000-01-01T00:00:00.000Z",
        nowMs: Date.now(),
        instanceRemainingBalance: 500,
        instanceStatus: "ACTIVE",
      })
    ).toBe(true);
    expect(
      isIssuedGiftInstanceStillValidAfterSalesEnd({
        salesEndsAt: "2000-01-01T00:00:00.000Z",
        nowMs: Date.now(),
        instanceRemainingBalance: 0,
        instanceStatus: "FULLY_REDEEMED",
      })
    ).toBe(true);
  });

  // T3
  it("T3 Face/Price funding rules", () => {
    expect(
      validateGiftProductFunding({
        faceValue: 1000,
        purchasePrice: 1000,
        discountFundingParty: "NONE",
      }).ok
    ).toBe(true);
    expect(
      validateGiftProductFunding({
        faceValue: 1000,
        purchasePrice: 950,
        discountFundingParty: "NONE",
      }).ok
    ).toBe(false);
    expect(
      validateGiftProductFunding({
        faceValue: 1000,
        purchasePrice: 950,
        discountFundingParty: "PLATFORM",
        platformFundedUnits: 50,
      })
    ).toEqual({ ok: true });
    expect(
      validateGiftProductFunding({
        faceValue: 1000,
        purchasePrice: 950,
        discountFundingParty: "MERCHANT",
        merchantFundedUnits: 50,
      })
    ).toEqual({ ok: true });
    expect(
      validateGiftProductFunding({
        faceValue: 1000,
        purchasePrice: 950,
        discountFundingParty: "SHARED",
        platformFundedUnits: 20,
        merchantFundedUnits: 30,
      })
    ).toEqual({ ok: true });
    expect(
      validateGiftProductFunding({
        faceValue: 1000,
        purchasePrice: 950,
        discountFundingParty: "SHARED",
        platformFundedUnits: 20,
        merchantFundedUnits: 20,
      }).ok
    ).toBe(false);
    expect(assertGiftMoneyInt(1000)).toBe(true);
    expect(assertGiftMoneyInt(10.5)).toBe(false);
  });

  // T4
  it("T4 Redemption calculation", () => {
    expect(
      computeGiftRedemptionSplit({ amountDueBeforeGift: 900, giftRemaining: 300 })
    ).toEqual({ redeemAmount: 300, remainingPayment: 600, giftRemainingAfter: 0 });
    expect(
      computeGiftRedemptionSplit({ amountDueBeforeGift: 300, giftRemaining: 1000 })
    ).toEqual({ redeemAmount: 300, remainingPayment: 0, giftRemainingAfter: 700 });
    expect(
      computeGiftRedemptionSplit({ amountDueBeforeGift: -1, giftRemaining: 100 })
    ).toEqual({ redeemAmount: 0, remainingPayment: 0, giftRemainingAfter: 100 });
  });

  // T5
  it("T5 Platform fee calculation (fixture rate only)", () => {
    const fee = computeGiftPlatformFeeAndMerchantNet({
      redeemedAmount: 300,
      platformFeeRatePercent: 10,
    });
    expect(fee).toEqual({ platformFeeAmount: 30, merchantNetAmount: 270 });
    expect(CONTRACT_SRC).not.toMatch(/platformFeeRate\s*=\s*10[^0-9]/);
    expect(GIFT_PLATFORM_FEE_RECOGNITION).toBe("order_completion");
  });

  // T6
  it("T6 Owner revenue only on order completion", () => {
    expect(GIFT_OWNER_REVENUE_RECOGNITION).toBe("order_completion");
    expect(GIFT_SALE_TIME_OWNER_REVENUE_FORBIDDEN).toBe(true);
    expect(ownerRevenueAtSaleTime()).toBe(0);
    expect(GIFT_REVENUE_STATUS_IS_LEDGER_PROJECTION).toBe(true);
  });

  // T7
  it("T7 Transfer legal transitions", () => {
    expect(canTransitionGiftTransfer("PENDING", "ACCEPTED")).toBe(true);
    expect(canTransitionGiftTransfer("PENDING", "REJECTED")).toBe(true);
    expect(canTransitionGiftTransfer("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionGiftTransfer("ACCEPTED", "REJECTED")).toBe(false);
    expect(canTransitionGiftTransfer("REJECTED", "PENDING")).toBe(false);
    expect(canTransitionGiftTransfer("CANCELLED", "ACCEPTED")).toBe(false);
    expect(GIFT_TRANSFERABLE_DEFAULT).toBe(true);
  });

  // T8
  it("T8 Pending lock prevents redeem", () => {
    expect(giftPendingBlocksRedeem("GIFT_LOCKED")).toBe(true);
    expect(giftInstanceAllowsRedeem("GIFT_LOCKED")).toBe(false);
    expect(giftInstanceAllowsRedeem("ACTIVE")).toBe(true);
  });

  // T9
  it("T9 Pending lock prevents regift", () => {
    expect(giftPendingBlocksRegift("GIFT_LOCKED")).toBe(true);
    expect(giftInstanceAllowsRegift("GIFT_LOCKED", true)).toBe(false);
    expect(giftInstanceAllowsRegift("ACTIVE", true)).toBe(true);
    expect(giftInstanceAllowsRegift("ACTIVE", false)).toBe(false);
  });

  // T10
  it("T10 Accepted transfer removes sender authority conceptually", () => {
    expect(senderRetainsAuthorityAfterAccept()).toBe(false);
    expect(
      evaluateGiftFriendEligibility({
        senderUserId: "a",
        recipientUserId: "b",
        senderHasRecipientAsFriendContact: true,
        recipientActive: true,
        blockedEitherWay: false,
        recipientRestricted: false,
        chatDomainIsGeneralDirect: true,
      })
    ).toEqual({ ok: true });
    expect(
      evaluateGiftFriendEligibility({
        senderUserId: "a",
        recipientUserId: "b",
        senderHasRecipientAsFriendContact: false,
        recipientActive: true,
        blockedEitherWay: false,
        recipientRestricted: false,
        chatDomainIsGeneralDirect: true,
      }).ok
    ).toBe(false);
  });

  // T11
  it("T11 Business Credit boundary", () => {
    expect(GIFT_BUSINESS_CREDIT_FIELD).toBe("stores.point_balance");
    expect(GIFT_FORBIDDEN_BALANCE_AUTHORITIES).toContain("stores.point_balance");
    expect(CONTRACT_SRC).toMatch(/stores\.point_balance/);
    expect(CONTRACT_SRC).toMatch(/Business Credit/);
    expect(CONTRACT_SRC).not.toMatch(/stores\.point_balance.*=.*[Gg]ift/);
  });

  // T12
  it("T12 Settlement boundary", () => {
    expect(GIFT_ORDER_SETTLEMENT_TABLE).toBe("store_settlements");
    expect(GIFT_FORBIDDEN_BALANCE_AUTHORITIES).toContain("store_settlements");
    expect(STORE_ORDER_FINANCIAL_CONTRACT.settlementPeriodField).toBe(
      "store_settlements.created_at"
    );
  });

  // T13
  it("T13 Checkout D-Point remains false", () => {
    expect(STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported).toBe(false);
    expect(giftContractKeepsCheckoutDpointFalse()).toBe(true);
    expect(GIFT_PURCHASE_PAYMENT_RAIL).toBe("d_point");
    expect(GIFT_DIRECT_GCASH_BANK_PURCHASE_DISABLED).toBe(true);
    expect(GIFT_POINT_P2P_DISABLED).toBe(true);
  });

  // T14
  it("T14 Coupon discount + Gift payment separation", () => {
    expect(GIFT_AFTER_COUPON_IN_CHECKOUT_CALC).toBe(true);
    const layers = computeCheckoutLayersBeforeAndAfterGift({
      itemGross: 900,
      deliveryFee: 100,
      couponDiscount: 100,
      giftRedeemAmount: 300,
    });
    expect(layers.amountDueBeforeGift).toBe(900);
    expect(layers.couponDiscount).toBe(100);
    expect(layers.giftRedemption).toBe(300);
    expect(layers.remainingPayment).toBe(600);
    expect(layers.couponDiscount + layers.giftRedemption).not.toBe(layers.couponDiscount);
    expect(GIFT_MAX_CERTIFICATES_PER_ORDER_INITIAL).toBe(1);
    expect(GIFT_REDEMPTION_ORDER_RELATION_ALLOWS_1_TO_N).toBe(true);
  });

  // T15
  it("T15 Recovery obligation rule", () => {
    expect(STORE_CASH_NEGATIVE_BALANCE_FORBIDDEN).toBe(true);
    expect(STORE_CASH_EXTERNAL_PAYOUT_IN_GIFT_SCOPE).toBe(false);
    expect(computeStoreCashRefundShortfall({ storeCashBalance: 270, reversalAmount: 270 })).toEqual({
      debitCash: 270,
      recoveryObligation: 0,
    });
    expect(computeStoreCashRefundShortfall({ storeCashBalance: 100, reversalAmount: 270 })).toEqual({
      debitCash: 100,
      recoveryObligation: 170,
    });
    expect(storeCashConversionApprovalAllowed({ openRecoveryObligationAmount: 0 })).toBe(true);
    expect(storeCashConversionApprovalAllowed({ openRecoveryObligationAmount: 170 })).toBe(false);
    expect(GIFT_ORDER_PARTIAL_REFUND_SUPPORTED).toBe(false);
    expect(STORE_ORDER_FINANCIAL_CONTRACT.partialRefundSupported).toBe(false);
  });

  // T16
  it("T16 Fully redeemed history retained", () => {
    expect(resolveGiftInstanceStatusAfterRedeem(0)).toBe("FULLY_REDEEMED");
    expect(resolveGiftInstanceStatusAfterRedeem(1)).toBe("PARTIALLY_REDEEMED");
    expect(GIFT_FULLY_REDEEMED_HISTORY_RETAINED).toBe(true);
    expect(GIFT_FULLY_REDEEMED_DELETE_FORBIDDEN).toBe(true);
  });
});
