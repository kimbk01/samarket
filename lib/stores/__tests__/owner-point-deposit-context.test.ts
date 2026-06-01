import { describe, expect, it } from "vitest";
import {
  canSubmitPointCharge,
  isPendingChargeStatus,
  resolveOwnerPointChargeUiState,
  resolveOwnerPointDepositStep,
  type OwnerPointPendingChargeSnapshot,
} from "@/lib/stores/owner-point-deposit-context";

const pending: OwnerPointPendingChargeSnapshot = {
  id: "c1",
  requestStatus: "pending",
  pointAmount: 100,
  paymentAmount: 100,
  requestedAt: "2026-01-03",
};

describe("resolveOwnerPointChargeUiState", () => {
  it("charge_pending when pending charge exists", () => {
    expect(resolveOwnerPointChargeUiState({ pendingCharge: pending })).toBe("charge_pending");
  });

  it("ready when no pending charge", () => {
    expect(resolveOwnerPointChargeUiState({ pendingCharge: null })).toBe("ready");
  });

  it("depositStep alias matches chargeUiState", () => {
    expect(
      resolveOwnerPointDepositStep({
        openInquiry: null,
        answeredInquiry: null,
        pendingCharge: pending,
      })
    ).toBe("charge_pending");
  });
});

describe("canSubmitPointCharge", () => {
  it("allows when no pending charge (no account inquiry required)", () => {
    const r = canSubmitPointCharge({ pendingCharge: null });
    expect(r.ok).toBe(true);
  });

  it("blocks when pending charge", () => {
    const r = canSubmitPointCharge({ pendingCharge: pending });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("charge_already_pending");
  });

  it("treats on_hold as pending charge status", () => {
    expect(isPendingChargeStatus("on_hold")).toBe(true);
    expect(isPendingChargeStatus("approved")).toBe(false);
  });
});
