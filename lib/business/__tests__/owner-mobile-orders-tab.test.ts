import { describe, expect, it } from "vitest";
import {
  effectiveOwnerMobileOrdersTab,
  orderMatchesOwnerMobileOrdersTabId,
  ownerMobileOrdersTabForStatus,
} from "@/lib/business/owner-mobile-orders-tab";

describe("ownerMobileOrdersTabForStatus", () => {
  it("maps statuses to mobile tabs", () => {
    expect(ownerMobileOrdersTabForStatus("pending")).toBe("new");
    expect(ownerMobileOrdersTabForStatus("preparing")).toBe("progress");
    expect(ownerMobileOrdersTabForStatus("delivering")).toBe("shipping");
    expect(ownerMobileOrdersTabForStatus("completed")).toBe("done");
    expect(ownerMobileOrdersTabForStatus("cancelled")).toBe("cancelled");
    expect(ownerMobileOrdersTabForStatus("refunded")).toBe("cancelled");
    expect(ownerMobileOrdersTabForStatus("refund_requested")).toBe("cancelled");
  });
});

describe("orderMatchesOwnerMobileOrdersTabId", () => {
  it("cancelled tab includes refund_requested (expand must not redirect away)", () => {
    const order = { order_status: "refund_requested" };
    expect(orderMatchesOwnerMobileOrdersTabId(order, "cancelled")).toBe(true);
    expect(ownerMobileOrdersTabForStatus("refund_requested")).toBe("cancelled");
  });

  it("shipping tab matches delivering only", () => {
    expect(orderMatchesOwnerMobileOrdersTabId({ order_status: "delivering" }, "shipping")).toBe(
      true
    );
    expect(orderMatchesOwnerMobileOrdersTabId({ order_status: "delivering" }, "progress")).toBe(
      false
    );
  });
});

describe("effectiveOwnerMobileOrdersTab", () => {
  it("maps legacy refund tab to cancelled bucket", () => {
    expect(effectiveOwnerMobileOrdersTab("refund")).toBe("cancelled");
  });
});
