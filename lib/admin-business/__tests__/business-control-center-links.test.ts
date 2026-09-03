import { describe, expect, it } from "vitest";
import {
  businessCcAuditHref,
  businessCcCancellationsHref,
  businessCcCashChargesHref,
  businessCcDeliveryAdsHref,
  businessCcDeliveryDistanceHref,
  businessCcEntryReviewHref,
  businessCcFeePoliciesHref,
  businessCcFinanceHref,
  businessCcOrdersByStoreHref,
  businessCcOwnerMemberHref,
  businessCcPartnerHref,
  businessCcProductsHref,
  businessCcPublicStoreHref,
  businessCcRefundsHref,
  businessCcReportsHref,
  businessCcReviewsHref,
  businessCcSettlementsHref,
  businessCcStoreOrdersHref,
  businessCcSupportHref,
} from "@/lib/admin-business/business-control-center-links";

describe("business-control-center-links", () => {
  it("keeps storeId in orders path", () => {
    expect(businessCcOrdersByStoreHref("abc-123")).toBe(
      "/admin/stores/orders/by-store/abc-123"
    );
    expect(businessCcStoreOrdersHref("abc-123")).toBe(
      "/admin/store-orders?store_id=abc-123"
    );
  });

  it("CUT E operation hub deep-links", () => {
    expect(businessCcFinanceHref("abc-123")).toBe("/admin/finance?storeId=abc-123");
    expect(businessCcDeliveryAdsHref("abc-123")).toContain("view=actionable");
    expect(businessCcSupportHref("abc-123")).toContain("search=abc-123");
    expect(businessCcCashChargesHref()).toBe("/admin/delivery-ads/cash-charges");
    expect(businessCcPartnerHref()).toBe("/admin/delivery-ads/partner");
  });

  it("deep-links products/reviews/audit/settlements with store_id", () => {
    expect(businessCcProductsHref("abc-123")).toBe(
      "/admin/store-products?store_id=abc-123"
    );
    expect(businessCcReviewsHref("abc-123")).toBe(
      "/admin/store-reviews?store_id=abc-123"
    );
    expect(businessCcAuditHref("abc-123")).toBe(
      "/admin/audit-logs?target_type=store&target_id=abc-123"
    );
    expect(businessCcSettlementsHref("abc-123")).toBe(
      "/admin/store-settlements?store_id=abc-123"
    );
  });

  it("deep-links cancellations/refunds/reports with store_id", () => {
    expect(businessCcCancellationsHref("abc-123")).toBe(
      "/admin/stores/orders/cancellations?store_id=abc-123"
    );
    expect(businessCcRefundsHref("abc-123")).toBe(
      "/admin/stores/orders/refunds?store_id=abc-123"
    );
    expect(businessCcReportsHref("abc-123")).toBe(
      "/admin/store-reports?store_id=abc-123"
    );
  });

  it("encodes entry review query", () => {
    expect(businessCcEntryReviewHref("CM KIM")).toBe("/admin/stores?q=CM%20KIM");
  });

  it("points fee and distance to existing SSOT admin routes", () => {
    expect(businessCcFeePoliciesHref()).toBe("/admin/store-fee-policies");
    expect(businessCcDeliveryDistanceHref()).toBe("/admin/delivery-distance");
  });

  it("links owner and public store", () => {
    expect(businessCcOwnerMemberHref("user-1")).toBe("/admin/users/user-1");
    expect(businessCcPublicStoreHref("my-slug")).toBe("/stores/my-slug");
  });
});
