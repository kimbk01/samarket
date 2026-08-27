import { describe, expect, it } from "vitest";
import {
  allowedOrderTransitions,
  allowedOrderTransitionsForActor,
  canBuyerRequestStoreRefund,
  shouldRestoreStockOnCancel,
} from "@/lib/stores/order-status-transitions";

describe("allowedOrderTransitionsForActor CUSTOMER", () => {
  it("pending → cancelled PASS", () => {
    expect(allowedOrderTransitionsForActor("CUSTOMER", "pending", "pickup")).toEqual(["cancelled"]);
  });

  it("accepted → cancelled FAIL", () => {
    expect(allowedOrderTransitionsForActor("CUSTOMER", "accepted", "pickup", { paymentStatus: "paid" })).not.toContain(
      "cancelled"
    );
  });

  it("accepted → refund_requested PASS when eligible", () => {
    expect(canBuyerRequestStoreRefund("accepted", "paid")).toBe(true);
    expect(
      allowedOrderTransitionsForActor("CUSTOMER", "accepted", "local_delivery", { paymentStatus: "paid" })
    ).toContain("refund_requested");
  });
});

describe("allowedOrderTransitionsForActor OWNER", () => {
  it("pending → accepted PASS", () => {
    expect(allowedOrderTransitionsForActor("OWNER", "pending", "pickup")).toContain("accepted");
  });

  it("accepted → preparing PASS", () => {
    expect(allowedOrderTransitionsForActor("OWNER", "accepted", "pickup")).toContain("preparing");
  });

  it("preparing → cancel_requested PASS", () => {
    expect(allowedOrderTransitionsForActor("OWNER", "preparing", "local_delivery")).toContain(
      "cancel_requested"
    );
  });

  it("completed → preparing FAIL", () => {
    expect(allowedOrderTransitionsForActor("OWNER", "completed", "pickup")).toEqual([]);
  });

  it("owner forward path includes base transitions", () => {
    for (const s of allowedOrderTransitions("ready_for_pickup", "pickup")) {
      expect(allowedOrderTransitionsForActor("OWNER", "ready_for_pickup", "pickup")).toContain(s);
    }
  });
});

describe("allowedOrderTransitionsForActor ADMIN", () => {
  it("pending → cancelled + refund_requested (pre-completion gift refund)", () => {
    expect(allowedOrderTransitionsForActor("ADMIN", "pending", "pickup")).toEqual([
      "cancelled",
      "refund_requested",
    ]);
  });

  it("cancel_requested → cancelled PASS", () => {
    expect(
      allowedOrderTransitionsForActor("ADMIN", "cancel_requested", "pickup", {
        restoreToStatus: "preparing",
      })
    ).toContain("cancelled");
  });

  it("cancel_requested → previous PASS", () => {
    expect(
      allowedOrderTransitionsForActor("ADMIN", "cancel_requested", "pickup", {
        restoreToStatus: "preparing",
      })
    ).toContain("preparing");
  });

  it("completed → cancelled FAIL", () => {
    expect(allowedOrderTransitionsForActor("ADMIN", "completed", "pickup")).not.toContain("cancelled");
  });

  it("completed → refund_requested PASS (post-completion gift refund)", () => {
    expect(allowedOrderTransitionsForActor("ADMIN", "completed", "pickup")).toEqual(["refund_requested"]);
  });

  it("refund_requested → refunded PASS", () => {
    expect(allowedOrderTransitionsForActor("ADMIN", "refund_requested", "pickup")).toEqual([
      "refunded",
    ]);
  });
});

describe("allowedOrderTransitionsForActor SYSTEM", () => {
  it("auto_complete arrived → completed when due", () => {
    expect(
      allowedOrderTransitionsForActor("SYSTEM", "arrived", "local_delivery", {
        autoCompleteDue: true,
        systemPurpose: "auto_complete",
      })
    ).toEqual(["completed"]);
  });

  it("payment_failure pending → cancelled", () => {
    expect(
      allowedOrderTransitionsForActor("SYSTEM", "pending", "pickup", {
        systemPurpose: "payment_failure",
      })
    ).toEqual(["cancelled"]);
  });

  it("payment_failure accepted → none", () => {
    expect(
      allowedOrderTransitionsForActor("SYSTEM", "accepted", "pickup", {
        systemPurpose: "payment_failure",
      })
    ).toEqual([]);
  });
});

describe("Recovery Chain stock restore", () => {
  it("cancel_requested → cancelled restores stock", () => {
    expect(shouldRestoreStockOnCancel("cancel_requested")).toBe(true);
  });

  it("pending/accepted restore stock", () => {
    expect(shouldRestoreStockOnCancel("pending")).toBe(true);
    expect(shouldRestoreStockOnCancel("accepted")).toBe(true);
  });

  it("refund_requested does not use cancel restore helper", () => {
    expect(shouldRestoreStockOnCancel("refund_requested")).toBe(false);
  });
});
