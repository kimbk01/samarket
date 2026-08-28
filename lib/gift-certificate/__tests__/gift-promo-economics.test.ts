import { describe, expect, it } from "vitest";
import {
  aggregatePromoDisplayFields,
  computeOwnerEconomicReportingSum,
  computePromoRecognitionSlice,
} from "@/lib/gift-certificate/gift-promo-economics";
import { computeGiftPlatformFeeAndMerchantNet } from "@/lib/gift-certificate/gift-certificate-domain-contract";

describe("gift promo economics (Ledger C)", () => {
  it("F=1000 S=900 FR=10% — Ledger B merchant_net unchanged when O_d=100", () => {
    const r1 = computeGiftPlatformFeeAndMerchantNet({ redeemedAmount: 600, platformFeeRatePercent: 10 });
    const r2 = computeGiftPlatformFeeAndMerchantNet({ redeemedAmount: 400, platformFeeRatePercent: 10 });
    expect(r1.merchantNetAmount).toBe(540);
    expect(r2.merchantNetAmount).toBe(360);
    expect(r1.merchantNetAmount + r2.merchantNetAmount).toBe(900);
    expect(r1.platformFeeAmount + r2.platformFeeAmount).toBe(100);
  });

  it("C2 proportional recognition with final slice remainder", () => {
    const O_d = 100;
    const F = 1000;
    const slice1 = computePromoRecognitionSlice({
      contractedAmount: O_d,
      alreadyRecognized: 0,
      redeemedSlice: 600,
      faceValue: F,
      isFinalSlice: false,
    });
    expect(slice1).toBe(60);

    const slice2 = computePromoRecognitionSlice({
      contractedAmount: O_d,
      alreadyRecognized: slice1,
      redeemedSlice: 400,
      faceValue: F,
      isFinalSlice: true,
    });
    expect(slice1 + slice2).toBe(100);
    expect(slice2).toBe(40);
  });

  it("aggregates CONTRACTED / RECOGNIZED / UNRECOGNIZED / SETTLED / OUTSTANDING", () => {
    const agg = aggregatePromoDisplayFields([
      { contractedAmount: 100, recognizedAmount: 60, settledAmount: 20 },
      { contractedAmount: 50, recognizedAmount: 50, settledAmount: 10 },
    ]);
    expect(agg).toEqual({
      contracted: 150,
      recognized: 110,
      unrecognized: 40,
      settled: 30,
      outstanding: 80,
    });
  });

  it("panel 3 economic sum is reporting-only (merchant − owner promo recognized)", () => {
    expect(
      computeOwnerEconomicReportingSum({
        recognizedMerchantNet: 900,
        ownerPromoRecognized: 100,
      })
    ).toBe(800);
  });
});
