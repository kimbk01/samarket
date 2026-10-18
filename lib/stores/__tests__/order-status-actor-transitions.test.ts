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

  it("accepted … arrived → cancel_requested (the store decides) — never refund_requested (D1)", () => {
    expect(canBuyerRequestStoreRefund("accepted", "paid")).toBe(true);
    for (const s of ["accepted", "preparing", "ready_for_pickup", "delivering", "arrived"]) {
      const next = allowedOrderTransitionsForActor("CUSTOMER", s, "local_delivery", { paymentStatus: "paid" });
      expect(next, s).toEqual(["cancel_requested"]);
    }
    expect(allowedOrderTransitionsForActor("CUSTOMER", "completed", "pickup", { paymentStatus: "paid" })).toEqual([]);
  });
});

describe("allowedOrderTransitionsForActor OWNER", () => {
  it("pending → accepted PASS", () => {
    expect(allowedOrderTransitionsForActor("OWNER", "pending", "pickup")).toContain("accepted");
  });

  it("accepted → preparing PASS", () => {
    expect(allowedOrderTransitionsForActor("OWNER", "accepted", "pickup")).toContain("preparing");
  });

  it("cooking or later (before pickup) → direct cancelled; the owner never creates cancel_requested", () => {
    for (const s of ["preparing", "ready_for_pickup", "delivering", "arrived"]) {
      const next = allowedOrderTransitionsForActor("OWNER", s, "local_delivery");
      expect(next, s).toContain("cancelled");
      expect(next, s).not.toContain("cancel_requested");
    }
  });

  it("owner decides requests: approve or restore only to the recorded previous status", () => {
    expect(allowedOrderTransitionsForActor("OWNER", "cancel_requested", "pickup")).toEqual(["cancelled"]);
    expect(
      allowedOrderTransitionsForActor("OWNER", "cancel_requested", "pickup", { restoreToStatus: "accepted" })
    ).toEqual(["cancelled", "accepted"]);
    expect(
      allowedOrderTransitionsForActor("OWNER", "cancel_requested", "pickup", { restoreToStatus: "completed" })
    ).toEqual(["cancelled"]);
    expect(allowedOrderTransitionsForActor("OWNER", "refund_requested", "pickup")).toEqual(["refunded"]);
    expect(
      allowedOrderTransitionsForActor("OWNER", "refund_requested", "pickup", { restoreToStatus: "accepted" })
    ).toEqual(["refunded", "accepted"]);
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
