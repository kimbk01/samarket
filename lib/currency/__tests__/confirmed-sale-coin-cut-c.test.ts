import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREDIT_COIN_FROM_CONFIRMED_SALE_RPC,
} from "@/lib/currency/confirmed-sale-coin-writer";
import { saleCoinIdempotencyKeyForOrder } from "@/lib/stores/confirmed-sale-revenue";

const CUT_C_MIG = readFileSync(
  join(process.cwd(), "supabase/migrations/20261202110000_currency_cut_c_sale_coin_ssot.sql"),
  "utf8"
);

describe("CUT C — sale_coin SSOT migration", () => {
  it("defines credit_coin_from_confirmed_sale with sale_coin idempotency enforcement", () => {
    expect(CUT_C_MIG).toContain(`CREATE OR REPLACE FUNCTION public.${CREDIT_COIN_FROM_CONFIRMED_SALE_RPC}`);
    expect(CUT_C_MIG).toContain("'sale_coin:' || p_order_id::text");
    expect(CUT_C_MIG).toContain("invalid_idempotency_key");
  });

  it("retires gift_coin mint in gift revenue recognition", () => {
    expect(CUT_C_MIG).not.toMatch(/v_coin := public\.credit_coin_from_gift_revenue/);
    expect(CUT_C_MIG).toContain("coin_mint', 'deferred_to_sale_coin");
    expect(CUT_C_MIG).toContain("gift_coin_mint_retired");
  });
});

describe("CUT C — TS hooks", () => {
  it("uses order-scoped sale_coin idempotency", () => {
    expect(saleCoinIdempotencyKeyForOrder("oid-1")).toBe("sale_coin:oid-1");
  });

  const SRC = readFileSync(
    join(process.cwd(), "lib/stores/apply-store-order-status-transition.ts"),
    "utf8"
  );

  it("calls recognizeOrderCurrencyOnCompleted on completed", () => {
    expect(SRC).toContain("recognizeOrderCurrencyOnCompleted");
  });
});
