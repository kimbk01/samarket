import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("store order recovery integrity contract", () => {
  it("single refund head + payment failure uses apply", () => {
    const refund = fs.readFileSync("lib/stores/apply-admin-store-order-refund.ts", "utf8");
    const payment = fs.readFileSync("lib/stores/record-store-order-payment.ts", "utf8");
    const adminOps = fs.readFileSync("lib/stores/apply-admin-store-order-operations.ts", "utf8");
    const apply = fs.readFileSync("lib/stores/apply-store-order-status-transition.ts", "utf8");

    expect(refund).toContain("adminCompleteRefundStoreOrder");
    expect(payment).toContain('systemPurpose: "payment_failure"');
    expect(payment).toContain("applyStoreOrderStatusTransition");
    expect(adminOps).not.toContain('eventType: "cancel_approved"');
    expect(adminOps).not.toContain('eventType: "cancel_rejected"');
    expect(apply).toContain('eventType: "cancel_approved"');
    expect(apply).toContain('eventType: "cancel_rejected"');
  });
});
