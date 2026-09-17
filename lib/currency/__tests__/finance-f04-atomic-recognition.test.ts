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

  it("TS uses atomic RPC only (no sequential dual writers)", () => {
    expect(TS).toContain("recognize_order_currency_on_completed");
    expect(TS).not.toContain("creditConfirmedSaleCoin");
    expect(TS).not.toContain("chargeSaleFeeForOrder");
    expect(TS).toContain("saleCoinIdempotencyKeyForOrder");
    expect(TS).toContain("saleFeeIdempotencyKeyForOrder");
  });
});
