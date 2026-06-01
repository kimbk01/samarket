import { describe, expect, it } from "vitest";
import {
  canSubmitPointCharge,
  isPendingChargeStatus,
  resolveOwnerPointDepositStep,
  type OwnerPointAccountInquirySnapshot,
} from "@/lib/stores/owner-point-deposit-context";

const answered: OwnerPointAccountInquirySnapshot = {
  id: "inq-1",
  status: "answered",
  subject: "Account",
  answer: "GCash 0917…",
  createdAt: "2026-01-01",
  answeredAt: "2026-01-02",
};

const open: OwnerPointAccountInquirySnapshot = {
  id: "inq-open",
  status: "open",
  subject: "Account",
  answer: null,
  createdAt: "2026-01-01",
  answeredAt: null,
};

describe("resolveOwnerPointDepositStep", () => {
  it("charge_pending when pending charge exists", () => {
    expect(
      resolveOwnerPointDepositStep({
        openInquiry: null,
        answeredInquiry: answered,
        pendingCharge: {
          id: "c1",
          requestStatus: "pending",
          pointAmount: 100,
          paymentAmount: 100,
          requestedAt: "2026-01-03",
        },
      })
    ).toBe("charge_pending");
  });

  it("deposit when answered inquiry with answer", () => {
    expect(
      resolveOwnerPointDepositStep({
        openInquiry: null,
        answeredInquiry: answered,
        pendingCharge: null,
      })
    ).toBe("deposit");
  });

  it("awaiting_answer when open inquiry", () => {
    expect(
      resolveOwnerPointDepositStep({
        openInquiry: open,
        answeredInquiry: null,
        pendingCharge: null,
      })
    ).toBe("awaiting_answer");
  });

  it("account_inquiry when nothing yet", () => {
    expect(
      resolveOwnerPointDepositStep({
        openInquiry: null,
        answeredInquiry: null,
        pendingCharge: null,
      })
    ).toBe("account_inquiry");
  });
});

describe("canSubmitPointCharge", () => {
  it("allows when answered and no pending", () => {
    const r = canSubmitPointCharge({ answeredInquiry: answered, pendingCharge: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inquiryId).toBe("inq-1");
  });

  it("blocks when pending charge", () => {
    const r = canSubmitPointCharge({
      answeredInquiry: answered,
      pendingCharge: {
        id: "c1",
        requestStatus: "pending",
        pointAmount: 10,
        paymentAmount: 10,
        requestedAt: "",
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("charge_already_pending");
  });

  it("blocks when on_hold charge", () => {
    const r = canSubmitPointCharge({
      answeredInquiry: answered,
      pendingCharge: {
        id: "c2",
        requestStatus: "on_hold",
        pointAmount: 10,
        paymentAmount: 10,
        requestedAt: "",
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("charge_already_pending");
  });

  it("treats on_hold as pending charge status", () => {
    expect(isPendingChargeStatus("on_hold")).toBe(true);
    expect(isPendingChargeStatus("approved")).toBe(false);
  });

  it("blocks when no answered inquiry", () => {
    const r = canSubmitPointCharge({ answeredInquiry: null, pendingCharge: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("account_inquiry_not_answered");
  });
});
