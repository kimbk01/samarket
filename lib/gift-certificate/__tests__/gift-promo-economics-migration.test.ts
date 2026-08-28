import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  GIFT_PROMO_ECONOMICS_MIGRATION_ID,
  GIFT_RPCS,
  GIFT_TABLES,
} from "@/lib/gift-certificate/gift-certificate-schema";

const MIG = readFileSync(
  resolve(process.cwd(), `supabase/migrations/${GIFT_PROMO_ECONOMICS_MIGRATION_ID}.sql`),
  "utf8"
);

describe("gift promo economics migration", () => {
  it("creates Ledger C tables and instance snapshot columns", () => {
    expect(MIG).toContain(`CREATE TABLE IF NOT EXISTS public.${GIFT_TABLES.promoObligations}`);
    expect(MIG).toContain(`CREATE TABLE IF NOT EXISTS public.${GIFT_TABLES.promoLedger}`);
    expect(MIG).toContain("purchase_discount_amount");
    expect(MIG).toContain("discount_funding_party_snapshot");
    expect(MIG).toContain("platform_fee_rate_snapshot");
  });

  it("defines C1/C2/C3 RPCs as service_role and never touches revenue_ledger in promo writers", () => {
    for (const rpc of [
      GIFT_RPCS.promoAccrueForInstance,
      GIFT_RPCS.promoRecognizeForRedemption,
      GIFT_RPCS.promoReverseForRedemption,
      GIFT_RPCS.promoSettle,
    ]) {
      expect(MIG).toContain(`CREATE OR REPLACE FUNCTION public.${rpc}`);
      expect(MIG).toContain(`GRANT EXECUTE ON FUNCTION public.${rpc}`);
    }
    expect(MIG).toContain("Never touches revenue_ledger");
    expect(MIG).toContain("promo writers NEVER touch gift_certificate_revenue_ledger");
  });

  it("hooks promo into purchase, recognition, and reversal paths", () => {
    expect(MIG).toContain("gift_certificate_promo_accrue_for_instance");
    expect(MIG).toContain("gift_certificate_promo_recognize_for_redemption");
    expect(MIG).toContain("gift_certificate_promo_reverse_for_redemption");
    expect(MIG).toContain(`CREATE OR REPLACE FUNCTION public.${GIFT_RPCS.purchase}`);
    expect(MIG).toContain(`CREATE OR REPLACE FUNCTION public.${GIFT_RPCS.recognizeRevenueForCompletedOrder}`);
    expect(MIG).toContain(`CREATE OR REPLACE FUNCTION public.${GIFT_RPCS.redemptionReverse}`);
  });
});
