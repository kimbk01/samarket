import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REVERSE_COIN_CREDITS_FOR_ORDER_RPC,
  coinReversalIdempotencyKeyForOrder,
} from "@/lib/currency/coin-reversal-writer";

const CUT_B_MIG = readFileSync(
  join(process.cwd(), "supabase/migrations/20261202100000_currency_cut_b_coin_reversal.sql"),
  "utf8"
);

describe("CUT B — coin reversal migration contract", () => {
  it("defines reverse_coin_credits_for_order RPC with REVERSAL entry_kind", () => {
    expect(CUT_B_MIG).toContain(`CREATE OR REPLACE FUNCTION public.${REVERSE_COIN_CREDITS_FOR_ORDER_RPC}`);
    expect(CUT_B_MIG).toContain("'REVERSAL', -v_to_reverse");
    expect(CUT_B_MIG).toContain("SALE_EARN', 'GIFT_REDEMPTION_EARN");
  });

  it("is idempotent via idempotency_key lookup", () => {
    expect(CUT_B_MIG).toMatch(/WHERE idempotency_key = v_key/);
    expect(CUT_B_MIG).toContain("'idempotent', true");
  });

  it("skips legacy Store Cash clawback when canonical Coin credit exists", () => {
    expect(CUT_B_MIG).toContain("v_has_coin_credit");
    expect(CUT_B_MIG).toContain("IF NOT v_has_coin_credit THEN");
  });

  it("freezes Gift Store Cash conversion request and approve RPCs", () => {
    expect(CUT_B_MIG).toContain("gift_store_cash_conversion_frozen");
    expect(CUT_B_MIG).toContain("gift_certificate_conversion_request");
    expect(CUT_B_MIG).toContain("gift_certificate_conversion_approve");
  });

  it("restricts reversal RPC to service_role", () => {
    expect(CUT_B_MIG).toContain(
      `GRANT EXECUTE ON FUNCTION public.${REVERSE_COIN_CREDITS_FOR_ORDER_RPC}(uuid, text, text) TO service_role`
    );
  });
});

describe("CUT B — coin reversal writer TS", () => {
  it("uses stable order-level idempotency key", () => {
    expect(coinReversalIdempotencyKeyForOrder("abc-123")).toBe("coin_reversal:order:abc-123");
  });
});

describe("CUT B — apply-store-order-status-transition hook", () => {
  const SRC = readFileSync(
    join(process.cwd(), "lib/stores/apply-store-order-status-transition.ts"),
    "utf8"
  );

  it("calls reverseCoinCreditsForOrder on refunded terminal path", () => {
    expect(SRC).toContain('from "@/lib/currency/coin-reversal-writer"');
    expect(SRC).toContain("reverseCoinCreditsForOrder");
    expect(SRC).toContain('reason: "order_refund"');
  });
});

describe("CUT B — Gift conversion API freeze", () => {
  const OWNER_POST = readFileSync(
    join(
      process.cwd(),
      "app/api/me/stores/[storeId]/gift-certificates/conversions/route.ts"
    ),
    "utf8"
  );
  const ADMIN_APPROVE = readFileSync(
    join(
      process.cwd(),
      "app/api/admin/gift-certificates/conversions/[id]/approve/route.ts"
    ),
    "utf8"
  );

  it("blocks owner POST with frozen error but keeps GET historical read", () => {
    expect(OWNER_POST).toContain("gift_store_cash_conversion_frozen");
    expect(OWNER_POST).toContain("export async function GET");
    expect(OWNER_POST).not.toContain("giftCertificateConversionRequest");
  });

  it("blocks admin approve with frozen error", () => {
    expect(ADMIN_APPROVE).toContain("gift_store_cash_conversion_frozen");
    expect(ADMIN_APPROVE).not.toContain("giftCertificateConversionApprove");
  });
});
