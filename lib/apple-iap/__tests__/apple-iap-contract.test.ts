import { describe, expect, it } from "vitest";
import {
  appleIapPhaseBlocksNewPurchase,
  appleIapPhaseFromPrepareError,
  appleIapPhaseFromServer,
  appleIapPhaseNeedsHelp,
  parseAppleIapAttemptStatus,
  parseAppleIapRefundStatus,
} from "@/lib/apple-iap/apple-iap-contract";

describe("apple-iap-contract", () => {
  it("maps every server status to a UI phase; success only for credited", () => {
    expect(appleIapPhaseFromServer("prepared", "none")).toBe("purchasing");
    expect(appleIapPhaseFromServer("deferred", "none")).toBe("awaiting_approval");
    expect(appleIapPhaseFromServer("received", "none")).toBe("verifying");
    expect(appleIapPhaseFromServer("credited", "none")).toBe("credited");
    expect(appleIapPhaseFromServer("user_cancelled", "none")).toBe("cancelled");
    expect(appleIapPhaseFromServer("failed", "none")).toBe("failed");
    expect(appleIapPhaseFromServer("review", "none")).toBe("review");
  });

  it("refund review overrides the purchase status; settled refunds do not", () => {
    expect(appleIapPhaseFromServer("credited", "review")).toBe("refund_review");
    expect(appleIapPhaseFromServer("credited", "reversed_review")).toBe("refund_review");
    expect(appleIapPhaseFromServer("credited", "recovered")).toBe("credited");
    expect(appleIapPhaseFromServer("received", "review")).toBe("refund_review");
  });

  it("blocks a new purchase while paying or confirming credit", () => {
    expect(appleIapPhaseBlocksNewPurchase("preparing")).toBe(true);
    expect(appleIapPhaseBlocksNewPurchase("purchasing")).toBe(true);
    expect(appleIapPhaseBlocksNewPurchase("verifying")).toBe(true);
    for (const p of ["idle", "credited", "cancelled", "failed", "awaiting_approval", "review", "refund_review"] as const) {
      expect(appleIapPhaseBlocksNewPurchase(p)).toBe(false);
    }
    expect(appleIapPhaseNeedsHelp("review")).toBe(true);
    expect(appleIapPhaseNeedsHelp("refund_review")).toBe(true);
    expect(appleIapPhaseNeedsHelp("failed")).toBe(false);
  });

  it("prepare errors: pending credit → verifying, anything else → failed (no payment happened)", () => {
    expect(appleIapPhaseFromPrepareError("apple_credit_pending")).toBe("verifying");
    expect(appleIapPhaseFromPrepareError("amount_exceeds_monthly_cap")).toBe("failed");
  });

  it("parses statuses defensively", () => {
    expect(parseAppleIapAttemptStatus("credited")).toBe("credited");
    expect(parseAppleIapAttemptStatus("approved")).toBeNull();
    expect(parseAppleIapRefundStatus("bogus")).toBe("none");
  });
});
