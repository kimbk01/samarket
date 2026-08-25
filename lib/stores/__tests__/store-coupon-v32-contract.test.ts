import { describe, expect, it } from "vitest";
import {
  resolveStoreCouponIssuerView,
  resolveStoreCouponPurposeView,
  storeCouponCustomerProviderKey,
} from "@/lib/stores/store-coupon-issuer-resolve";
import {
  buildCheckoutQuoteView,
  buildCartCouponLineViews,
  ineligibleReasonToMessageKey,
} from "@/lib/stores/store-coupon-product-view";
import { parseStoreCouponCampaignCreateBody } from "@/lib/stores/store-coupon-campaign-validation";
import { isStoreCouponCampaignPurpose, isStoreCouponIssuerRole } from "@/lib/stores/store-coupon-ssot";

describe("FREE COUPON v3.2 contract (TS layer)", () => {
  it("issuer_role NULL → legacy_not_proven (no funding inference)", () => {
    const view = resolveStoreCouponIssuerView({
      issuerRole: null,
      createdByUserId: "some-owner-uuid",
      actorLabel: "Owner Name",
    });
    expect(view.legacyNotProven).toBe(true);
    expect(view.role).toBeNull();
    expect(view.roleKey).toBe("store_coupon_issuer_legacy_not_proven");
  });

  it("forward owner issuer resolves explicitly", () => {
    const view = resolveStoreCouponIssuerView({
      issuerRole: "owner",
      createdByUserId: "u1",
    });
    expect(view.role).toBe("owner");
    expect(view.roleKey).toBe("store_coupon_issuer_role_owner");
    expect(view.legacyNotProven).toBe(false);
  });

  it("campaignPurpose validated on create body", () => {
    const parsed = parseStoreCouponCampaignCreateBody({
      storeId: "s1",
      title: "Promo",
      discountType: "fixed_amount",
      discountValue: 100,
      startAt: "2026-08-25T00:00:00.000Z",
      endAt: "2026-09-25T00:00:00.000Z",
      campaignPurpose: "new_customer_acquisition",
      fundingMode: "STORE_FUNDED",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.campaignPurpose).toBe("new_customer_acquisition");
    }
  });

  it("invalid purpose falls back to store_promotion default", () => {
    const parsed = parseStoreCouponCampaignCreateBody({
      storeId: "s1",
      title: "Promo",
      discountType: "fixed_amount",
      discountValue: 100,
      startAt: "2026-08-25T00:00:00.000Z",
      endAt: "2026-09-25T00:00:00.000Z",
      campaignPurpose: "invented_purpose",
      fundingMode: "STORE_FUNDED",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.campaignPurpose).toBe("store_promotion");
  });

  it("checkout quote final = subtotal - menu - coupon + delivery", () => {
    const quote = buildCheckoutQuoteView({
      subtotalPhp: 900,
      menuDiscountPhp: 0,
      couponTitle: "QA",
      couponNumber: "CPN-TEST-001",
      couponDiscountPhp: 100,
      deliveryFeePhp: 50,
    });
    expect(quote.finalPaymentPhp).toBe(850);
    expect(quote.lines.at(-1)?.amountPhp).toBe(850);
    expect(quote.couponNumber).toBe("CPN-TEST-001");
  });

  it("cart lines separate applicable vs ineligible with best flag", () => {
    const { applicable, ineligible } = buildCartCouponLineViews({
      quotes: [
        {
          userCouponId: "u1",
          campaignId: "c1",
          title: "Small",
          discountAmount: 50,
          ineligibleReason: null,
          couponNumber: "N1",
        },
        {
          userCouponId: "u2",
          campaignId: "c2",
          title: "Big",
          discountAmount: 90,
          ineligibleReason: null,
          couponNumber: "N2",
        },
        {
          userCouponId: "u3",
          campaignId: "c3",
          title: "Blocked",
          discountAmount: 0,
          ineligibleReason: "coupon_min_order",
          minOrderPhp: 700,
          shortagePhp: 100,
          couponNumber: "N3",
        },
      ],
      appliedUserCouponId: "u2",
      bestUserCouponId: "u2",
      storeName: "QA Store",
      campaignMetaById: {
        c1: { providerKey: storeCouponCustomerProviderKey("STORE_FUNDED"), benefitLabel: "₱50" },
        c2: { providerKey: storeCouponCustomerProviderKey("STORE_FUNDED"), benefitLabel: "₱90" },
        c3: { providerKey: storeCouponCustomerProviderKey("STORE_FUNDED"), benefitLabel: "₱0" },
      },
    });
    expect(applicable).toHaveLength(2);
    expect(ineligible).toHaveLength(1);
    expect(applicable.find((l) => l.isApplied)?.userCouponId).toBe("u2");
    expect(applicable.find((l) => l.isBest)?.userCouponId).toBe("u2");
    expect(ineligibleReasonToMessageKey("coupon_min_order")).toBe("store_err_coupon_min_order");
  });

  it("SSOT enums guard issuer and purpose values", () => {
    expect(isStoreCouponIssuerRole("owner")).toBe(true);
    expect(isStoreCouponIssuerRole("customer")).toBe(false);
    expect(isStoreCouponCampaignPurpose("platform_event")).toBe(true);
    expect(resolveStoreCouponPurposeView(null).purposeKey).toBe("store_coupon_purpose_legacy_not_proven");
  });
});
