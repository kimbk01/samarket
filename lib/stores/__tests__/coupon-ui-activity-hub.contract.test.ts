import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDeliveryOrderHistoryHref } from "@/lib/delivery/customer/delivery-order-history-nav";

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
    const hub = readFileSync(join(process.cwd(), "components/orders/DeliveryActivityHub.tsx"), "utf8");
    expect(hub).toMatch(/href=\"\/orders\"/);
    expect(hub).toMatch(/mypage\/coupons\?from=delivery-activity/);
    expect(hub).toMatch(/data-delivery-activity-hub/);
  });

  it("orders list back targets activity hub", () => {
    const hdr = readFileSync(
      join(process.cwd(), "components/orders/BuyerDeliveryOrdersHeader.tsx"),
      "utf8"
    );
    expect(hdr).toMatch(/backHref=\"\/orders\/activity\"/);
  });
});
