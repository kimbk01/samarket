import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDeliveryOrderHistoryHref } from "@/lib/delivery/customer/delivery-order-history-nav";
import { canonicalHubHref } from "@/lib/delivery/customer/commerce-hub-nav";

describe("Coupon UI / Activity Hub presentation contracts", () => {
  it("customer face is certificate hierarchy without purpose/menu dump", () => {
    const face = readFileSync(
      join(process.cwd(), "components/stores/coupon/StoreCouponCustomerCard.tsx"),
      "utf8"
    );
    expect(face).toMatch(/data-coupon-face-benefit/);
    expect(face).toMatch(/data-coupon-face-title/);
    expect(face).toMatch(/data-coupon-face-store-visual/);
    expect(face).not.toMatch(/purposeKey/);
    expect(face).not.toMatch(/menuPreviewTitles/);
    expect(face).not.toMatch(/store_coupon_number_legacy/);
  });

  it("buyer header document entry goes to activity hub", () => {
    expect(resolveDeliveryOrderHistoryHref(null)).toBe("/orders/activity");
    expect(canonicalHubHref("coupons", { from: "delivery-activity" })).toMatch(
      /tab=coupons/
    );
    expect(canonicalHubHref("gifts", { from: "delivery-activity" })).toMatch(/tab=gifts/);
    const hubPage = readFileSync(
      join(process.cwd(), "components/orders/customer-commerce/CustomerCommerceHubPage.tsx"),
      "utf8"
    );
    expect(hubPage).toMatch(/CustomerCommerceHubBody/);
    expect(hubPage).toMatch(/CommerceHubChromeSyncGate/);
  });

  it("hub primary tabs are path-embedded in AppStickyHeader", () => {
    const header = readFileSync(join(process.cwd(), "components/layout/AppStickyHeader.tsx"), "utf8");
    expect(header).toMatch(/CustomerCommerceHubPrimaryTabs/);
    expect(header).toMatch(/isCustomerCommerceHubPath/);
  });
});
