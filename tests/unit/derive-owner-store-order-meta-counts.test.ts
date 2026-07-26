import { describe, expect, it } from "vitest";
import { deriveOwnerStoreOrderMetaCounts } from "@/lib/delivery/owner/derive-owner-store-order-meta-counts";

describe("deriveOwnerStoreOrderMetaCounts", () => {
  it("matches server pending / delivery / refund conditions", () => {
    const counts = deriveOwnerStoreOrderMetaCounts([
      { order_status: "pending", fulfillment_type: "pickup" },
      { order_status: "pending", fulfillment_type: "local_delivery" },
      { order_status: "preparing", fulfillment_type: "local_delivery" },
      { order_status: "refund_requested", fulfillment_type: "local_delivery" },
    ]);
    expect(counts.pendingAcceptCount).toBe(2);
    expect(counts.pendingDeliveryCount).toBe(1);
    expect(counts.refundRequestedCount).toBe(1);
  });
});
