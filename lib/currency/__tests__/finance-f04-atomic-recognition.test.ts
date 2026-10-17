import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIG = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20270118140000_finance_f04_recognize_order_currency_atomic.sql"),
  "utf8"
);
const TS = readFileSync(
  resolve(process.cwd(), "lib/currency/recognize-order-currency-on-completed.ts"),
  "utf8"
);

describe("F-04 atomic order currency recognition", () => {
  it("defines single SECURITY DEFINER RPC that calls coin then fee", () => {
    expect(MIG).toContain("recognize_order_currency_on_completed");
    expect(MIG).toContain("credit_coin_from_confirmed_sale");
    expect(MIG).toContain("charge_sale_fee_for_order");
    expect(MIG).toContain("RAISE EXCEPTION 'recognize_order_currency_fee_failed:");
    expect(MIG).toContain("GRANT EXECUTE");
    expect(MIG).toContain("service_role");
  });

  /**
   * Superseded by the store-commission SSOT: commission is charged at 조리 시작 (preparing),
   * Coin at completion — two different events, so the F-04 pairing no longer applies.
   * Each writer is still a single idempotent DB RPC.
   */
  it("TS: completion = platform-held Coin only (commission is the DB status trigger's job)", () => {
    expect(TS).not.toContain("chargeStoreCommissionForOrder");
    expect(TS).toContain("credit_coin_from_confirmed_sale");
    expect(TS).toContain("saleCoinIdempotencyKeyForOrder");
    expect(TS).toContain("platformHeldSaleAmountPhp");
    // Buyer payment goes to the store directly — never part of the Coin mint read.
    expect(TS).not.toMatch(/\.select\([^)]*payment_amount/);
    expect(TS).not.toContain("chargeSaleFeeForOrder");
  });
});
