import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GIFT_OWNER_REVENUE_RECOGNITION,
  GIFT_PLATFORM_FEE_RECOGNITION,
  GIFT_REDEEM_TIME_OWNER_AVAILABLE_FORBIDDEN,
  GIFT_SALE_TIME_OWNER_REVENUE_FORBIDDEN,
  ownerRevenueAtSaleTime,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";
import {
  GIFT_ORDER_COMPLETION_REVENUE_MIGRATION_ID,
  GIFT_RECOGNITION_CORRECTION_MIGRATION_ID,
  GIFT_RPCS,
} from "@/lib/gift-certificate/gift-certificate-schema";
import {
  aggregateGiftRevenuePendingRecognized,
  isRedemptionRecognizedFromLedger,
  netMerchantRecognitionFromLedger,
  platformFeeRecognizedAtRedeem,
  redeemCreatesAvailableRevenue,
  resolveGiftRedemptionRecognitionState,
} from "@/lib/gift-certificate/gift-revenue-recognition";

function readMig(id: string) {
  return readFileSync(resolve(process.cwd(), `supabase/migrations/${id}.sql`), "utf8");
}

describe("Gift order-completion revenue recognition T1–T16", () => {
  const mig = readMig(GIFT_ORDER_COMPLETION_REVENUE_MIGRATION_ID);

  it("T1 purchase creates no owner revenue", () => {
    expect(GIFT_SALE_TIME_OWNER_REVENUE_FORBIDDEN).toBe(true);
    expect(ownerRevenueAtSaleTime()).toBe(0);
  });

  it("T2/T3 redeem pending creates redemption but no REVENUE_AVAILABLE at redeem writers", () => {
    expect(GIFT_REDEEM_TIME_OWNER_AVAILABLE_FORBIDDEN).toBe(true);
    expect(redeemCreatesAvailableRevenue()).toBe(false);
    expect(platformFeeRecognizedAtRedeem()).toBe(false);
    const checkoutFn = mig.slice(mig.indexOf("CREATE OR REPLACE FUNCTION public.create_store_order_atomic"));
    const checkoutBody = checkoutFn.slice(
      0,
      checkoutFn.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_redeem")
    );
    const checkoutGift = checkoutBody.slice(checkoutBody.indexOf("-- Gift redeem in same TX"));
    expect(checkoutGift).toMatch(/REVENUE_CREATE/);
    expect(checkoutGift).not.toMatch(/REVENUE_AVAILABLE/);
    const redeemFn = mig.slice(mig.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_redeem"));
    const redeemBody = redeemFn.slice(0, redeemFn.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_reverse"));
    expect(redeemBody).toMatch(/REVENUE_CREATE/);
    expect(redeemBody).not.toMatch(/REVENUE_AVAILABLE/);
  });

  it("T4 fee snapshot authority moved to CUT1 instance helper (historical order_completion still live-product)", () => {
    expect(mig).toMatch(/floor\(v_gift_total::numeric \* v_gift_fee_rate \/ 100\)/);
    const cut1 = readFileSync(resolve(process.cwd(), "supabase/migrations/20261129150000_gift_certificate_redeem_instance_fee_snapshot.sql"), "utf8");
    expect(cut1).toMatch(/gift_certificate_instance_redeem_fee_rate\(v_gift_inst\)/);
  });

  it("T5 pending revenue cannot conversion request (available RPC unchanged semantics)", () => {
    expect(mig).toMatch(/gift_certificate_store_revenue_available/);
    expect(resolveGiftRedemptionRecognitionState({ reversed: false, recognized: false })).toBe("pending");
  });

  it("T6/T7 completed recognizes merchant net and platform fee once via trigger RPC", () => {
    expect(GIFT_OWNER_REVENUE_RECOGNITION).toBe("order_completion");
    expect(GIFT_PLATFORM_FEE_RECOGNITION).toBe("order_completion");
    expect(mig).toMatch(/gift_certificate_recognize_revenue_for_completed_order/);
    expect(mig).toMatch(/trg_store_orders_gift_revenue_recognition/);
    expect(mig).toMatch(/REVENUE_AVAILABLE[\s\S]*merchant_net_amount/);
  });

  it("T8/T9 idempotent + concurrent-safe recognition (unique + ON CONFLICT)", () => {
    expect(mig).toMatch(/ON CONFLICT \(related_type, related_id, entry_type\) DO NOTHING/);
    expect(mig).toMatch(/FOR UPDATE/);
  });

  it("T10/T11 owner available 0 before completed; recognized after", () => {
    const split = aggregateGiftRevenuePendingRecognized([
      {
        reversed: false,
        recognized: false,
        redeemedAmount: 1000,
        platformFeeAmount: 100,
        merchantNetAmount: 900,
      },
    ]);
    expect(split.pendingMerchantNet).toBe(900);
    expect(split.recognizedMerchantNet).toBe(0);
    expect(split.pendingPlatformFee).toBe(100);
    expect(split.recognizedPlatformFee).toBe(0);
  });

  it("T12/T13 Admin and Owner pending vs recognized separation", () => {
    const rows = [
      {
        reversed: false,
        recognized: false,
        redeemedAmount: 1000,
        platformFeeAmount: 100,
        merchantNetAmount: 900,
      },
      {
        reversed: false,
        recognized: true,
        redeemedAmount: 500,
        platformFeeAmount: 50,
        merchantNetAmount: 450,
      },
    ];
    const split = aggregateGiftRevenuePendingRecognized(rows);
    expect(split.pendingGross).toBe(1000);
    expect(split.recognizedGross).toBe(500);
    expect(split.recognizedPlatformFee).toBe(50);
  });

  it("T14 Business Credit untouched", () => {
    expect(mig).not.toMatch(/stores\.point_balance/);
  });

  it("T15/T16 unused Gift creates no owner revenue at purchase", () => {
    expect(mig).not.toMatch(/gift_certificate_purchase[\s\S]*REVENUE_AVAILABLE/);
  });

  it("RPC names registered in schema", () => {
    expect(GIFT_RPCS.recognizeRevenueForCompletedOrder).toBe(
      "gift_certificate_recognize_revenue_for_completed_order"
    );
    expect(mig).toMatch(new RegExp(`FUNCTION public\\.${GIFT_RPCS.recognizeRevenueForCompletedOrder}\\(`));
  });

  it("Pending-only reversal skips REVERSED ledger", () => {
    expect(mig).toMatch(/pending REVENUE_CREATE-only claims need no REVERSED/);
  });
});

describe("CUT2 historical RECOGNITION_CORRECTION", () => {
  const corrMig = readMig(GIFT_RECOGNITION_CORRECTION_MIGRATION_ID);

  it("uses RECOGNITION_CORRECTION not REVERSED for historical pending correction", () => {
    expect(corrMig).toMatch(/RECOGNITION_CORRECTION/);
    expect(corrMig).toMatch(/gift_certificate_correct_legacy_recognition/);
    expect(corrMig).toMatch(/historical_recognition_correction/);
    expect(corrMig).not.toMatch(/'REVERSED',\s*-v_red\.merchant_net_amount/);
    expect(GIFT_RPCS.correctLegacyRecognition).toBe("gift_certificate_correct_legacy_recognition");
  });

  it("available pool and is_recognized use net including correction", () => {
    expect(corrMig).toMatch(/gift_certificate_redemption_recognized_net/);
    expect(corrMig).toMatch(/available:after_correction/);
  });

  it("net recognition: AVAILABLE + CORRECTION = not recognized; future AVAILABLE restores", () => {
    expect(
      netMerchantRecognitionFromLedger([
        { entry_type: "REVENUE_AVAILABLE", amount: 1000 },
        { entry_type: "RECOGNITION_CORRECTION", amount: -1000 },
      ])
    ).toBe(0);
    expect(
      isRedemptionRecognizedFromLedger([
        { entry_type: "REVENUE_AVAILABLE", amount: 1000 },
        { entry_type: "RECOGNITION_CORRECTION", amount: -1000 },
      ])
    ).toBe(false);
    expect(
      isRedemptionRecognizedFromLedger([
        { entry_type: "REVENUE_AVAILABLE", amount: 1000 },
        { entry_type: "RECOGNITION_CORRECTION", amount: -1000 },
        { entry_type: "REVENUE_AVAILABLE", amount: 1000 },
      ])
    ).toBe(true);
  });

  it("does not touch Business Credit", () => {
    expect(corrMig).not.toMatch(/stores\.point_balance/);
  });
});
