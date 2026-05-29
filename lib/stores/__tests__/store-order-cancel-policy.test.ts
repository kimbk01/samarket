import { describe, expect, it } from "vitest";
import { resolveStoreOrderCancelPolicy } from "@/lib/stores/store-order-cancel-policy";

describe("resolveStoreOrderCancelPolicy", () => {
  it("allows owner direct cancel before cooking starts", () => {
    expect(resolveStoreOrderCancelPolicy({ role: "owner", orderStatus: "pending" }).kind).toBe("direct_cancel");
    expect(resolveStoreOrderCancelPolicy({ role: "owner", orderStatus: "accepted" }).kind).toBe("direct_cancel");
  });

  it("requires owner cancel request after cooking starts", () => {
    expect(resolveStoreOrderCancelPolicy({ role: "owner", orderStatus: "preparing" }).kind).toBe("request_cancel");
    expect(resolveStoreOrderCancelPolicy({ role: "owner", orderStatus: "ready_for_pickup" }).kind).toBe("request_cancel");
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
});
