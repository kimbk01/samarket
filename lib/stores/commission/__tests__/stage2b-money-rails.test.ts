import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeStorePlatformPayableSplit,
  computeStoreSaleCommissionPhp,
  DELIVERY_FEE_PERCENT_MODE_DISABLED_ERROR,
  isDeliveryFeeModeAllowed,
  SALE_COIN_CAP_INTEGRITY_CHECK,
  STORE_PAYOUT_CLASS_LABEL,
} from "@/lib/stores/commission/store-commission-contract";
import {
  platformHeldSaleAmountPhp,
  recognizeOrderCurrencyOnCompleted,
} from "@/lib/currency/recognize-order-currency-on-completed";
import {
  GIFT_RAIL_PAYOUT_RPC,
  parseGiftRailPayoutSummary,
  payGiftRailToStore,
  validateGiftRailPayoutForm,
} from "@/lib/gift-certificate/gift-rail-payout";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const MIG_RAIL = read("supabase/migrations/20270603120000_stage2b_fin03_gift_rail_payout.sql");
const MIG_COIN = read("supabase/migrations/20270603120100_stage2b_fin03_gft02_sale_coin_platform_coupon_only.sql");
const MIG_INTEGRITY = read("supabase/migrations/20270603120200_stage2b_gft02_integrity_sale_coin_cap.sql");
const MIG_POLICY = read("supabase/migrations/20270603120300_stage2b_fin13_fee_policy_no_delivery_percent.sql");

/** H §2 example: ₱1,000 + delivery 50, store coupon 100, platform coupon 40, gift 300 (10%), 7%. */
const H = { payment: 610, gift: 300, giftNet: 270, coupon: 40 };

describe("FIN-03 option A — Coin = platform coupon only, gift on its own rail", () => {
  it("platformHeldSaleAmountPhp ignores gift redemption", () => {
    expect(platformHeldSaleAmountPhp({ gift_redemption_amount: H.gift, platform_funded_amount: H.coupon })).toBe(40);
    expect(platformHeldSaleAmountPhp({ gift_redemption_amount: 1000, platform_funded_amount: 0 })).toBe(0);
  });

  it("H §2: platform owes 310 = gift 270 (rail) + coin 40; identity holds", () => {
    const s = computeStorePlatformPayableSplit({
      paymentAmountPhp: H.payment,
      giftRedeemedPhp: H.gift,
      giftMerchantNetPhp: H.giftNet,
      platformFundedPhp: H.coupon,
    });
    expect(s).toEqual({
      directPhp: 610,
      giftFeePhp: 30,
      giftRailNetPhp: 270,
      coinDuePhp: 40,
      platformOwesPhp: 310,
      storeReceiptsPhp: 920,
    });
    expect(s.directPhp + s.giftRailNetPhp + s.coinDuePhp).toBe(1050 - 100 - 30);
  });

  it("gift_rail label says it is paid via gift payout (not 'not paid here')", () => {
    expect(STORE_PAYOUT_CLASS_LABEL.gift_rail.en).toBe("Gift rail payable (net, paid via gift payout)");
    expect(STORE_PAYOUT_CLASS_LABEL.gift_rail.ko).not.toContain("여기서 지급 안 함");
  });

  describe("recognizeOrderCurrencyOnCompleted (env DIBAY_CURRENCY_SALE_RECOGNITION_LIVE)", () => {
    const prev = process.env.DIBAY_CURRENCY_SALE_RECOGNITION_LIVE;
    afterEach(() => {
      if (prev === undefined) delete process.env.DIBAY_CURRENCY_SALE_RECOGNITION_LIVE;
      else process.env.DIBAY_CURRENCY_SALE_RECOGNITION_LIVE = prev;
    });

    function mockSb(order: Record<string, unknown>) {
      const rpc = vi.fn(async () => ({ data: { ok: true, idempotent: false }, error: null }));
      const from = vi.fn((table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === "store_orders" ? order : null, error: null }),
          }),
        }),
      }));
      return { sb: { from, rpc } as unknown as SupabaseClient, rpc };
    }

    it("ON: mints only platform_funded_amount with sale_coin:{order}", async () => {
      process.env.DIBAY_CURRENCY_SALE_RECOGNITION_LIVE = "true";
      const { sb, rpc } = mockSb({
        id: "o1",
        store_id: "s1",
        order_status: "completed",
        gift_redemption_amount: 300,
        platform_funded_amount: 40,
      });
      const r = await recognizeOrderCurrencyOnCompleted(sb, "o1");
      expect(r).toMatchObject({ ok: true, platformHeldPhp: 40, coinCredited: true });
      expect(rpc).toHaveBeenCalledWith("credit_coin_from_confirmed_sale", expect.objectContaining({
        p_amount: 40,
        p_idempotency_key: "sale_coin:o1",
      }));
    });

    it("ON: gift-only order mints nothing", async () => {
      process.env.DIBAY_CURRENCY_SALE_RECOGNITION_LIVE = "true";
      const { sb, rpc } = mockSb({ id: "o2", store_id: "s1", order_status: "completed", gift_redemption_amount: 300, platform_funded_amount: 0 });
      const r = await recognizeOrderCurrencyOnCompleted(sb, "o2");
      expect(r).toEqual({ ok: true, skipped: true, platformHeldPhp: 0 });
      expect(rpc).not.toHaveBeenCalled();
    });

    it("OFF: no mint at all", async () => {
      delete process.env.DIBAY_CURRENCY_SALE_RECOGNITION_LIVE;
      const { sb, rpc } = mockSb({ id: "o1", store_id: "s1", order_status: "completed", platform_funded_amount: 40 });
      expect(await recognizeOrderCurrencyOnCompleted(sb, "o1")).toEqual({ ok: true, skipped: true });
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});

describe("GFT-02 — mint cap + integrity check (legacy_preserved)", () => {
  it("credit_coin_from_confirmed_sale refuses a mint above the order's platform coupon", () => {
    expect(MIG_COIN).toContain("RAISE EXCEPTION 'coin_mint_exceeds_platform_held");
    expect(MIG_COIN).toContain("o.store_id = p_store_id");
    // cap runs after the idempotent re-check (legacy keys stay idempotent, no clawback)
    const body = MIG_COIN.slice(MIG_COIN.indexOf("FUNCTION public.credit_coin_from_confirmed_sale"));
    expect(body.indexOf("Re-check after waiting")).toBeLessThan(body.indexOf("coin_mint_exceeds_platform_held"));
    expect(body.indexOf("coin_mint_exceeds_platform_held")).toBeLessThan(body.indexOf("ensure_store_economic_point_account"));
    expect(MIG_COIN).toContain("49773271f36eda0227f9a3e2231fbc5b");
  });

  it("integrity report adds sale_coin_le_platform_coupon with the 2026-10-20 20:30 UTC cutoff", () => {
    expect(MIG_INTEGRITY).toContain(`'${SALE_COIN_CAP_INTEGRITY_CHECK}'`);
    expect(MIG_INTEGRITY).toContain("'2026-10-20 20:30:00+00'::timestamptz");
    expect(MIG_INTEGRITY).toContain("'legacy_preserved'");
    expect(MIG_INTEGRITY).toContain("b7871c44f74347ddd6d9e26fb1115270");
    expect(MIG_COIN).toContain("'2026-10-20 20:30:00+00'::timestamptz");
  });

  it("payable page: Coin rail = platform coupon; gift rail net + coin = platform owes", () => {
    expect(MIG_COIN).toContain("AS coin_due_php");
    expect(MIG_COIN).toContain("coin_due_php - LEAST(coin_due_php, coin_minted) AS payable_php");
    expect(MIG_COIN).toContain("gift_rail_net_php + coin_due_php AS platform_owes_php");
    // keys read by store_commission_enqueue_exception_notifications are kept
    for (const k of ["coin_over_credit", "legacy_net_php", "'exceptions'", "class IN ('payable', 'legacy_manual_paid')"]) {
      expect(MIG_COIN).toContain(k);
    }
  });
});

describe("Gift rail payout RPC", () => {
  it("SECURITY DEFINER, service_role only, admin re-check, lock, reference + key unique, ledger + audit", () => {
    expect(MIG_RAIL).toContain("FUNCTION public.gift_certificate_admin_store_payout(");
    expect(MIG_RAIL).toContain("SECURITY DEFINER");
    expect(MIG_RAIL).toContain("internal.is_platform_admin(p_admin_user_id)");
    expect(MIG_RAIL).toContain("pg_advisory_xact_lock(hashtext('gift_rev:' || p_store_id::text))");
    expect(MIG_RAIL).toContain("'payout_exceeds_available'");
    expect(MIG_RAIL).toContain("gift_certificate_store_payouts_reference_uq");
    expect(MIG_RAIL).toContain("CONSTRAINT gift_certificate_store_payouts_idem_uq UNIQUE (idempotency_key)");
    expect(MIG_RAIL).toContain("'PAYOUT_PAID', -p_amount, 'gift_store_payout'");
    expect(MIG_RAIL).toContain("INSERT INTO public.audit_logs");
    expect(MIG_RAIL).toMatch(/REVOKE ALL ON FUNCTION public\.gift_certificate_admin_store_payout\([^)]*\)\s+FROM PUBLIC, anon, authenticated;/);
    expect(MIG_RAIL).toMatch(/GRANT EXECUTE ON FUNCTION public\.gift_certificate_admin_store_payout\([^)]*\)\s+TO service_role;/);
    // available nets the payout
    expect(MIG_RAIL).toContain("'CASH_OUT_PAID',\n          'PAYOUT_PAID'");
    expect(MIG_RAIL).toContain("f61498267bb47af2b53da858ccc086eb");
  });

  it("form pre-check mirrors the RPC rules", () => {
    const base = { amountPhp: 100, availablePhp: 270, payoutMethod: "gcash", payoutReference: "GC-1" };
    expect(validateGiftRailPayoutForm(base)).toEqual({ ok: true });
    expect(validateGiftRailPayoutForm({ ...base, amountPhp: 271 })).toEqual({ ok: false, error: "payout_exceeds_available" });
    expect(validateGiftRailPayoutForm({ ...base, amountPhp: 0 })).toEqual({ ok: false, error: "invalid_args" });
    expect(validateGiftRailPayoutForm({ ...base, payoutReference: " " })).toEqual({ ok: false, error: "payout_reference_required" });
    expect(validateGiftRailPayoutForm({ ...base, payoutMethod: "cash" })).toEqual({ ok: false, error: "payout_method_required" });
  });

  it("maps RPC results (ok / refused / missing)", async () => {
    const input = {
      adminUserId: "a",
      storeId: "s",
      amountPhp: 100,
      payoutMethod: "gcash",
      payoutReference: "GC-1",
      payoutNote: null,
      idempotencyKey: "k",
    };
    const ok = { rpc: vi.fn(async () => ({ data: { ok: true, idempotent: false, payout_id: "p1", amount: 100, available_before: 270, available_after: 170 }, error: null })) };
    expect(await payGiftRailToStore(ok as unknown as SupabaseClient, input)).toEqual({
      ok: true, idempotent: false, payoutId: "p1", amountPhp: 100, availableBeforePhp: 270, availableAfterPhp: 170,
    });
    expect(ok.rpc).toHaveBeenCalledWith(GIFT_RAIL_PAYOUT_RPC, expect.objectContaining({ p_amount: 100, p_idempotency_key: "k" }));
    const refused = { rpc: vi.fn(async () => ({ data: { ok: false, error: "payout_exceeds_available", available: 50 }, error: null })) };
    expect(await payGiftRailToStore(refused as unknown as SupabaseClient, input)).toEqual({
      ok: false, error: "payout_exceeds_available", status: 409, availablePhp: 50,
    });
    const missing = { rpc: vi.fn(async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } })) };
    expect(await payGiftRailToStore(missing as unknown as SupabaseClient, input)).toEqual({ ok: false, error: "rpc_missing", status: 503 });
  });

  it("summary parser", () => {
    expect(parseGiftRailPayoutSummary("s", { available: 170, paid_out: 100, payout_count: 1, last_paid_at: "t" })).toEqual({
      storeId: "s", availablePhp: 170, paidOutPhp: 100, payoutCount: 1, lastPaidAt: "t",
    });
  });
});

describe("FIN-13 / D-3 — current commission contract, percent delivery mode refused", () => {
  it("H §2: base 950 (delivery fee + gift included) → fee 66", () => {
    expect(
      computeStoreSaleCommissionPhp({
        paymentAmountPhp: H.payment,
        giftRedemptionPhp: H.gift,
        platformFundedPhp: H.coupon,
        feePercent: 7,
        fixedFeePhp: 0,
      })
    ).toEqual({ basePhp: 950, feePhp: 66 });
    expect(
      computeStoreSaleCommissionPhp({ paymentAmountPhp: 10, giftRedemptionPhp: 0, platformFundedPhp: 0, feePercent: 7, fixedFeePhp: 50 })
    ).toEqual({ basePhp: 10, feePhp: 10 });
  });

  it("percent mode is refused (API helper + DB CHECK NOT VALID)", () => {
    expect(isDeliveryFeeModeAllowed("none")).toBe(true);
    expect(isDeliveryFeeModeAllowed(undefined)).toBe(true);
    expect(isDeliveryFeeModeAllowed("percent")).toBe(false);
    expect(isDeliveryFeeModeAllowed(" Percent ")).toBe(false);
    expect(MIG_POLICY).toContain("CHECK (delivery_fee_mode IS DISTINCT FROM 'percent') NOT VALID");
    for (const p of ["app/api/admin/store-fee-policies/route.ts", "app/api/admin/store-fee-policies/[id]/route.ts"]) {
      const src = read(p);
      expect(src).toContain("isDeliveryFeeModeAllowed");
      expect(src).toContain("DELIVERY_FEE_PERCENT_MODE_DISABLED_ERROR");
    }
    expect(DELIVERY_FEE_PERCENT_MODE_DISABLED_ERROR).toBe("delivery_fee_percent_mode_disabled");
  });

  it("SSOT doc states the formula with the H §2 example", () => {
    const doc = read("docs/store-commission-cash-settlement-ssot.md");
    expect(doc).toContain("판매 수수료 산식 (D-3");
    expect(doc).toContain("610 + 300 + 40 = **950**");
    expect(doc).toContain("상품권 270(레일) + Coin 40 = **310**");
  });
});
