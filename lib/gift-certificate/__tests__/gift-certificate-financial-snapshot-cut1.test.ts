import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeGiftPlatformFeeAndMerchantNet } from "@/lib/gift-certificate/gift-certificate-domain-contract";
import {
  GIFT_FINANCIAL_SNAPSHOT_MIGRATION_ID,
  GIFT_INSTANCE_VALIDITY_MIGRATION_ID,
  GIFT_PROMO_ECONOMICS_MIGRATION_ID,
  GIFT_SCOPE_PLATFORM_MIGRATION_ID,
} from "@/lib/gift-certificate/gift-certificate-schema";

function readMig(id: string) {
  return readFileSync(resolve(process.cwd(), `supabase/migrations/${id}.sql`), "utf8");
}

const CUT1 = readMig(GIFT_FINANCIAL_SNAPSHOT_MIGRATION_ID);
const VALIDITY = readMig(GIFT_INSTANCE_VALIDITY_MIGRATION_ID);
const PROMO = readMig(GIFT_PROMO_ECONOMICS_MIGRATION_ID);
const SCOPE = readMig(GIFT_SCOPE_PLATFORM_MIGRATION_ID);
const PRODUCT_PATCH = readFileSync(
  resolve(process.cwd(), "app/api/admin/gift-certificates/products/[id]/route.ts"),
  "utf8",
);

function giftCheckoutBlock(mig: string) {
  const fn = mig.slice(mig.indexOf("CREATE OR REPLACE FUNCTION public.create_store_order_atomic"));
  return fn.slice(fn.indexOf("-- Gift redeem in same TX"), fn.indexOf("v_result := jsonb_build_object"));
}

describe("Gift CUT1 financial snapshot contracts", () => {
  it("F5 STATIC: checkout uses instance fee authority helper", () => {
    expect(CUT1).toMatch(/gift_certificate_instance_redeem_fee_rate\(v_gift_inst\)/);
    const checkoutGift = giftCheckoutBlock(CUT1);
    expect(checkoutGift).not.toMatch(/FROM public\.gift_certificate_products[\s\S]*platform_fee_rate/);
  });

  it("F6 STATIC: standalone redeem uses instance fee authority helper", () => {
    expect(CUT1).toMatch(/gift_certificate_instance_redeem_fee_rate\(v_inst\)/);
    const redeemFn = CUT1.slice(CUT1.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_redeem"));
    expect(redeemFn).not.toMatch(/SELECT platform_fee_rate INTO v_fee_rate[\s\S]*gift_certificate_products/);
  });

  it("F7 STATIC: no coalesce 0 fallback and no product-fee backfill in migration", () => {
    expect(CUT1).not.toMatch(/coalesce\(v_inst\.platform_fee_rate_snapshot,\s*0\)/);
    expect(CUT1).not.toMatch(/coalesce\(v_gift_inst\.platform_fee_rate_snapshot,\s*0\)/);
    expect(CUT1).not.toMatch(/SET platform_fee_rate_snapshot = p\.platform_fee_rate/);
    expect(CUT1).toMatch(/legacy_fee_snapshot_unresolved/);
    expect(CUT1).toMatch(/redemption evidence only/i);
  });

  it("F9 STATIC: legitimate zero preserved via purchase payload contract", () => {
    const purchase = CUT1.slice(CUT1.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_purchase"));
    expect(purchase).toMatch(/'platform_fee_rate_snapshot', v_product\.platform_fee_rate/);
    expect(CUT1).toMatch(/payload \? 'platform_fee_rate_snapshot'/);
  });

  it("F10 STATIC: migration forbids current product fee as historical fallback", () => {
    expect(CUT1).not.toMatch(/SET platform_fee_rate_snapshot = p\.platform_fee_rate/);
  });

  it("F11 P1-P4 STATIC: purchase merges validity + promo snapshot contract", () => {
    const purchase = CUT1.slice(CUT1.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_purchase"));
    expect(purchase).toMatch(/valid_from, valid_until/);
    expect(purchase).toMatch(/gift_certificate_resolve_validity_at_issue/);
    expect(purchase).toMatch(/platform_fee_rate_snapshot/);
    expect(purchase).toMatch(/discount_funding_party_snapshot/);
    expect(purchase).toMatch(/purchase_discount_amount/);
    expect(purchase).toMatch(/gift_certificate_promo_accrue_for_instance/);
    const validityPurchase = VALIDITY.slice(VALIDITY.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_purchase"));
    expect(validityPurchase).not.toMatch(/platform_fee_rate_snapshot,\s*\n\s*v_product\.platform_fee_rate/);
    expect(purchase).toMatch(/v_product\.platform_fee_rate\s*\n\s*\)/);
  });

  it("F12 STATIC: checkout and standalone redeem share fee authority helper", () => {
    expect(CUT1.match(/gift_certificate_instance_redeem_fee_rate/g)?.length).toBeGreaterThanOrEqual(3);
    expect(giftCheckoutBlock(SCOPE)).toMatch(/FROM public\.gift_certificate_products/);
    expect(giftCheckoutBlock(CUT1)).not.toMatch(/FROM public\.gift_certificate_products[\s\S]*v_gift_fee_rate/);
  });

  it("F1 STATIC: pure calc — instance A 10% vs B 8% after master change", () => {
    const a = computeGiftPlatformFeeAndMerchantNet({ redeemedAmount: 1000, platformFeeRatePercent: 10 });
    const b = computeGiftPlatformFeeAndMerchantNet({ redeemedAmount: 1000, platformFeeRatePercent: 8 });
    expect(a.platformFeeAmount).toBe(100);
    expect(b.platformFeeAmount).toBe(80);
    expect(a.platformFeeAmount).not.toBe(b.platformFeeAmount);
  });

  it("F2 STATIC: product PATCH does not update redemptions", () => {
    expect(PRODUCT_PATCH).not.toMatch(/gift_certificate_redemptions/);
    expect(PRODUCT_PATCH).not.toMatch(/money_fields_locked_after_issuance/);
  });

  it("F3 STATIC: validity dates remain on purchase path", () => {
    expect(CUT1).toMatch(/valid_from, valid_until/);
    expect(PRODUCT_PATCH).not.toMatch(/UPDATE[\s\S]*gift_certificate_instances/);
  });

  it("F4 STATIC: product PATCH updates products only", () => {
    expect(PRODUCT_PATCH).toMatch(/\.from\(GIFT_TABLES\.products\)/);
    expect(PRODUCT_PATCH).not.toMatch(/gift_certificate_instances.*update/i);
  });

  it("F8 STATIC: promo recognize uses obligations not live product funding", () => {
    const promoRecognize = PROMO.slice(PROMO.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_promo_recognize_for_redemption"));
    expect(promoRecognize).toMatch(/gift_promo_obligations/);
    expect(promoRecognize).not.toMatch(/discount_funding_party FROM public\.gift_certificate_products/);
  });
});
