import { describe, expect, it } from "vitest";
import { resolveStoreOrderCancelPolicy } from "@/lib/stores/store-order-cancel-policy";

describe("resolveStoreOrderCancelPolicy", () => {
  it("allows owner direct cancel before cooking starts", () => {
    expect(resolveStoreOrderCancelPolicy({ role: "owner", orderStatus: "pending" }).kind).toBe("direct_cancel");
    expect(resolveStoreOrderCancelPolicy({ role: "owner", orderStatus: "accepted" }).kind).toBe("direct_cancel");
  });

  it("owner cancels directly after cooking starts too (reason required, no admin approval)", () => {
    for (const orderStatus of ["preparing", "ready_for_pickup", "delivering", "arrived"]) {
      const p = resolveStoreOrderCancelPolicy({ role: "owner", orderStatus });
      expect(p.kind, orderStatus).toBe("direct_cancel");
      expect(p.reasonRequired, orderStatus).toBe(true);
    }
  });

  it("hides cancellation after pickup or terminal states", () => {
    expect(
      resolveStoreOrderCancelPolicy({
        role: "owner",
        orderStatus: "delivering",
        deliveryStatus: "pickup_in_progress",
      }).kind
    ).toBe("hidden");
    expect(resolveStoreOrderCancelPolicy({ role: "owner", orderStatus: "completed" }).kind).toBe("hidden");
    expect(resolveStoreOrderCancelPolicy({ role: "owner", orderStatus: "cancel_requested" }).kind).toBe("hidden");
  });

  it("buyer may direct-cancel only while pending; afterwards a cancel request (reason required)", () => {
    expect(resolveStoreOrderCancelPolicy({ role: "buyer", orderStatus: "pending" }).kind).toBe("direct_cancel");
    for (const orderStatus of ["accepted", "preparing", "ready_for_pickup", "delivering", "arrived"]) {
      const p = resolveStoreOrderCancelPolicy({ role: "buyer", orderStatus });
      expect(p.kind, orderStatus).toBe("request_cancel");
      expect(p.reasonRequired, orderStatus).toBe(true);
    }
    expect(
      resolveStoreOrderCancelPolicy({ role: "buyer", orderStatus: "delivering", deliveryStatus: "pickup_in_progress" }).kind
    ).toBe("hidden");
    expect(resolveStoreOrderCancelPolicy({ role: "buyer", orderStatus: "completed" }).kind).toBe("hidden");
    expect(resolveStoreOrderCancelPolicy({ role: "buyer", orderStatus: "cancel_requested" }).kind).toBe("hidden");
  });
});
