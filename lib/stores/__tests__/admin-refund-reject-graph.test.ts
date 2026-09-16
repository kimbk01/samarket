import { describe, expect, it } from "vitest";
import {
  ADMIN_REFUND_REQUEST_RESTORE_STATUSES,
  allowedOrderTransitionsForActor,
} from "@/lib/stores/order-status-transitions";

describe("admin refund reject restore graph", () => {
  it("allows refunded or restore targets from refund_requested for ADMIN", () => {
    const edges = allowedOrderTransitionsForActor("ADMIN", "refund_requested", "local_delivery", {
      restoreToStatus: "completed",
    });
    expect(edges).toContain("refunded");
    expect(edges).toContain("completed");
  });

  it("does not invent refund_rejected status", () => {
    expect(ADMIN_REFUND_REQUEST_RESTORE_STATUSES.has("refund_rejected")).toBe(false);
    for (const s of ADMIN_REFUND_REQUEST_RESTORE_STATUSES) {
      expect(
        ["accepted", "preparing", "ready_for_pickup", "delivering", "arrived", "completed"].includes(s)
      ).toBe(true);
    }
  });
});
