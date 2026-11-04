import { describe, expect, it } from "vitest";
import {
  effectiveOwnerMobileOrdersTab,
  orderMatchesOwnerMobileOrdersTabId,
  ownerMobileOrdersTabForStatus,
  OWNER_MOBILE_ORDER_TAB_IDS,
} from "@/lib/business/owner-mobile-orders-tab";

/** 주문 탭 = 4단계 정본 (Owner 2026-11-04 · 설계안 v2 §3-5) */
describe("ownerMobileOrdersTabForStatus", () => {
  it("maps statuses to stage tabs", () => {
    expect(ownerMobileOrdersTabForStatus("pending")).toBe("new");
    expect(ownerMobileOrdersTabForStatus("accepted")).toBe("accepted");
    expect(ownerMobileOrdersTabForStatus("preparing")).toBe("preparing");
    expect(ownerMobileOrdersTabForStatus("ready_for_pickup", "local_delivery")).toBe("preparing");
    expect(ownerMobileOrdersTabForStatus("ready_for_pickup", "pickup")).toBe("shipping");
    expect(ownerMobileOrdersTabForStatus("delivering")).toBe("shipping");
    expect(ownerMobileOrdersTabForStatus("arrived")).toBe("shipping");
    expect(ownerMobileOrdersTabForStatus("completed")).toBe("done");
    expect(ownerMobileOrdersTabForStatus("cancelled")).toBe("cancelled");
    expect(ownerMobileOrdersTabForStatus("cancel_requested")).toBe("cancelled");
    expect(ownerMobileOrdersTabForStatus("refunded")).toBe("cancelled");
    expect(ownerMobileOrdersTabForStatus("refund_requested")).toBe("refund");
  });
  it("tab order = 전체 · 접수 대기 · 주문접수 · 조리중 · 배달중·픽업대기 · 완료 · 취소·환불 · 환불 요청", () => {
    expect([...OWNER_MOBILE_ORDER_TAB_IDS]).toEqual([
      "every",
      "new",
      "accepted",
      "preparing",
      "shipping",
      "done",
      "cancelled",
      "refund",
    ]);
  });
});

describe("orderMatchesOwnerMobileOrdersTabId", () => {
  it("refund tab holds refund_requested (expand must not redirect away)", () => {
    const order = { order_status: "refund_requested" };
    expect(orderMatchesOwnerMobileOrdersTabId(order, "refund")).toBe(true);
    expect(orderMatchesOwnerMobileOrdersTabId(order, "every")).toBe(true);
  });

  it("shipping tab matches delivering only", () => {
    expect(orderMatchesOwnerMobileOrdersTabId({ order_status: "delivering" }, "shipping")).toBe(true);
    expect(orderMatchesOwnerMobileOrdersTabId({ order_status: "delivering" }, "preparing")).toBe(false);
  });
});

describe("effectiveOwnerMobileOrdersTab", () => {
  it("maps legacy URLs", () => {
    expect(effectiveOwnerMobileOrdersTab("refund")).toBe("refund");
    expect(effectiveOwnerMobileOrdersTab("progress")).toBe("accepted");
    expect(effectiveOwnerMobileOrdersTab("ready")).toBe("shipping");
    expect(effectiveOwnerMobileOrdersTab("all")).toBe("new");
  });
});
