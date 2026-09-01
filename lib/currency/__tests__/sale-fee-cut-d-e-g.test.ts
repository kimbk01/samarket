import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHARGE_SALE_FEE_FOR_ORDER_RPC,
  SETTLE_SALE_FEE_OBLIGATIONS_RPC,
} from "@/lib/currency/sale-fee-writer";
import { isAst002AcceptFeeRetired } from "@/lib/currency/currency-cutover-flags";

const CUT_D_MIG = readFileSync(
  join(process.cwd(), "supabase/migrations/20261202120000_currency_cut_d_sale_fee_obligation.sql"),
  "utf8"
);

describe("CUT D — sale fee + obligation migration", () => {
  it("creates store_sale_fee_obligations table", () => {
    expect(CUT_D_MIG).toContain("CREATE TABLE IF NOT EXISTS public.store_sale_fee_obligations");
    expect(CUT_D_MIG).toContain("fee_outstanding_minor");
  });

  it("defines charge_sale_fee_for_order RPC", () => {
    expect(CUT_D_MIG).toContain(`CREATE OR REPLACE FUNCTION public.${CHARGE_SALE_FEE_FOR_ORDER_RPC}`);
    expect(CUT_D_MIG).toContain("'SALE_FEE', 'debit'");
  });

  it("defines reverse_sale_fee_for_order on refund", () => {
    const revMig = readFileSync(
      join(process.cwd(), "supabase/migrations/20261202125000_currency_cut_d_sale_fee_reversal_on_refund.sql"),
      "utf8"
    );
    expect(revMig).toContain("reverse_sale_fee_for_order");
    expect(revMig).toContain("SALE_FEE_REVERSAL");
    expect(revMig).toContain("status = 'waived'");
  });

  it("defines settle_store_sale_fee_obligations and hooks top-up + convert", () => {
    expect(CUT_D_MIG).toContain(`CREATE OR REPLACE FUNCTION public.${SETTLE_SALE_FEE_OBLIGATIONS_RPC}`);
    expect(CUT_D_MIG).toContain("SALE_FEE_SETTLEMENT");
    expect(CUT_D_MIG).toContain("settle_store_sale_fee_obligations(v_req.store_id)");
    expect(CUT_D_MIG).toContain("settle_store_sale_fee_obligations(p_store_id)");
  });
});

describe("CUT E — AST-002 retire gate", () => {
  const SRC = readFileSync(
    join(process.cwd(), "lib/stores/apply-store-order-status-transition.ts"),
    "utf8"
  );

  it("gates chargeStorePointsOnOrderAccept behind isAst002AcceptFeeRetired", () => {
    expect(SRC).toContain("isAst002AcceptFeeRetired");
    expect(SRC).toContain("chargeStorePointsOnOrderAccept");
  });

  it("calls reverseSaleFeeForOrder on refunded path", () => {
    expect(SRC).toContain("reverseSaleFeeForOrder");
  });

  it("exports cutover flag helper", () => {
    expect(typeof isAst002AcceptFeeRetired()).toBe("boolean");
  });
});

const CUT_G_MIG = readFileSync(
  join(process.cwd(), "supabase/migrations/20261202130000_currency_cut_g_rpc_acl.sql"),
  "utf8"
);

describe("CUT G — RPC ACL", () => {
  it("revokes client execute on coin mint RPCs", () => {
    expect(CUT_G_MIG).toContain("REVOKE ALL ON FUNCTION public.credit_coin_from_confirmed_sale");
    expect(CUT_G_MIG).toContain("FROM PUBLIC, anon, authenticated");
    expect(CUT_G_MIG).toContain("TO service_role");
  });
});
