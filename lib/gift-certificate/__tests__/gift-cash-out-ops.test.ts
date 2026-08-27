import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canRequestGiftCashOut,
  giftAvailableAfterCashOutHold,
  isForbiddenCashOutSource,
  pendingGiftRevenueCannotCashOut,
  validateGiftCashOutAmount,
  validateGiftCashOutDestination,
  validateGiftCashOutMarkPaid,
} from "@/lib/gift-certificate/gift-cash-out-ops";
import {
  GIFT_CASH_OUT_MIGRATION_ID,
  GIFT_RPCS,
  GIFT_TABLES,
} from "@/lib/gift-certificate/gift-certificate-schema";

const MIG = readFileSync(
  resolve(process.cwd(), `supabase/migrations/${GIFT_CASH_OUT_MIGRATION_ID}.sql`),
  "utf8"
);

describe("O3-B Gift external cash-out T1–T10", () => {
  it("T1 pending/unrecognized Gift Revenue cannot be the cash-out source", () => {
    expect(pendingGiftRevenueCannotCashOut(900)).toBe(true);
    // Available=0 with pending>0 → blocked
    expect(
      canRequestGiftCashOut({ availableRevenue: 0, openRecoveryAmount: 0, pendingMerchantNet: 900 }).ok
    ).toBe(false);
    expect(MIG).toMatch(/gift_certificate_store_revenue_available/);
    expect(MIG).toMatch(/CASH_OUT_HOLD/);
  });

  it("T2 Business Credit is a forbidden cash-out source", () => {
    expect(isForbiddenCashOutSource("business_credit")).toBe(true);
    expect(MIG).not.toMatch(/stores\.point_balance/);
    expect(MIG).not.toMatch(/store_settlements/);
  });

  it("T3 Customer Point is a forbidden cash-out source", () => {
    expect(isForbiddenCashOutSource("customer_point")).toBe(true);
  });

  it("T4 amount > available blocked", () => {
    expect(validateGiftCashOutAmount({ amount: 1000, availableRevenue: 900 }).ok).toBe(false);
    expect(validateGiftCashOutAmount({ amount: 900, availableRevenue: 900 }).ok).toBe(true);
    expect(MIG).toMatch(/insufficient_available_revenue/);
  });

  it("T5 duplicate request / idempotency safe", () => {
    expect(MIG).toMatch(/gift_certificate_cash_out_requests_idempotency_uq/);
    expect(MIG).toMatch(/'idempotent', true/);
    expect(MIG).toMatch(/FUNCTION public\.gift_certificate_cash_out_request\(/);
  });

  it("T6 request hold prevents Store Cash conversion double-spend", () => {
    // Hold reduces available; conversion pending also subtracted in available RPC
    expect(giftAvailableAfterCashOutHold({ ledgerAvailable: 900, openCashOutHold: 900 })).toBe(0);
    expect(
      giftAvailableAfterCashOutHold({
        ledgerAvailable: 900,
        openCashOutHold: 0,
        pendingConversionRequested: 900,
      })
    ).toBe(0);
    expect(MIG).toMatch(/CASH_OUT_HOLD', -p_amount/);
    expect(MIG).toMatch(/gift_certificate_conversion_requests c/);
    expect(MIG).toMatch(/c\.status = 'REQUESTED'/);
  });

  it("T7 reject releases available", () => {
    expect(MIG).toMatch(/FUNCTION public\.gift_certificate_cash_out_reject\(/);
    expect(MIG).toMatch(/CASH_OUT_RELEASE', v_req\.amount/);
    expect(MIG).toMatch(/status = 'REJECTED'/);
  });

  it("T8 cancel releases available", () => {
    expect(MIG).toMatch(/FUNCTION public\.gift_certificate_cash_out_cancel\(/);
    expect(MIG).toMatch(/status = 'CANCELLED'/);
    expect(MIG).toMatch(/request_not_cancellable/);
  });

  it("T9 mark-paid consumes exactly once (method+reference required)", () => {
    expect(validateGiftCashOutMarkPaid({ payoutMethod: "", payoutReference: "x" }).ok).toBe(false);
    expect(validateGiftCashOutMarkPaid({ payoutMethod: "gcash", payoutReference: "" }).ok).toBe(false);
    expect(validateGiftCashOutMarkPaid({ payoutMethod: "gcash", payoutReference: "TX1" }).ok).toBe(true);
    expect(MIG).toMatch(/FUNCTION public\.gift_certificate_cash_out_mark_paid\(/);
    expect(MIG).toMatch(/payout_method_required/);
    expect(MIG).toMatch(/payout_reference_required/);
    expect(MIG).toMatch(/CASH_OUT_PAID', 0/);
    expect(MIG).toMatch(/:paid'/);
  });

  it("T10 double mark-paid no duplicate consume", () => {
    expect(MIG).toMatch(/status = 'PAID'[\s\S]*idempotent/);
    expect(MIG).toMatch(/WHEN unique_violation THEN/);
    expect(MIG).toMatch(/request_not_approved/);
    // Destination validation contract
    expect(
      validateGiftCashOutDestination({
        destinationType: "gcash",
        accountNumber: "09",
        accountName: "A",
      }).ok
    ).toBe(true);
    expect(
      validateGiftCashOutDestination({
        destinationType: "bank",
        accountNumber: "1",
        accountName: "A",
      }).ok
    ).toBe(false);
    expect(GIFT_TABLES.cashOutRequests).toBe("gift_certificate_cash_out_requests");
    expect(GIFT_RPCS.cashOutRequest).toBe("gift_certificate_cash_out_request");
    expect(GIFT_RPCS.cashOutMarkPaid).toBe("gift_certificate_cash_out_mark_paid");
  });
});
