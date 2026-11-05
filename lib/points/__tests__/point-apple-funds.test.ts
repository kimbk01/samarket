import { describe, expect, it } from "vitest";
import {
  POINT_APPLE_FUNDS_RESTRICTED,
  isPointAppleFundsRestrictedError,
  parsePointAppleFundSummary,
} from "@/lib/points/point-apple-funds";
import {
  giftPurchaseErrorFallbacks,
  mapGiftPurchaseErrorKey,
  readGiftPurchaseErrorAmounts,
} from "@/lib/gift-certificate/map-gift-purchase-error";

describe("Apple-charged Point restriction (ads/promotion only)", () => {
  it("detects the DB guard error inside a PostgREST message", () => {
    expect(isPointAppleFundsRestrictedError("point_apple_funds_restricted")).toBe(true);
    expect(isPointAppleFundsRestrictedError(`ERROR: ${POINT_APPLE_FUNDS_RESTRICTED}`)).toBe(true);
    expect(isPointAppleFundsRestrictedError("insufficient_balance")).toBe(false);
    expect(isPointAppleFundsRestrictedError(null)).toBe(false);
  });

  it("parses summary; negative total keeps usable at 0", () => {
    expect(parsePointAppleFundSummary({ total: 1100, apple_only: 1000, general_available: 100 })).toEqual({
      totalPoints: 1100,
      appleOnlyPoints: 1000,
      generalAvailablePoints: 100,
    });
    expect(parsePointAppleFundSummary({ total: -700, apple_only: 0, general_available: 0 })).toEqual({
      totalPoints: -700,
      appleOnlyPoints: 0,
      generalAvailablePoints: 0,
    });
    expect(parsePointAppleFundSummary(null)).toBeNull();
    expect(parsePointAppleFundSummary({})).toBeNull();
  });

  it("gift purchase maps the restriction to member copy with total and usable Point (ko/en)", () => {
    const key = mapGiftPurchaseErrorKey("point_apple_funds_restricted");
    expect(key).toBe("gift_u2_err_apple_restricted");
    const amounts = readGiftPurchaseErrorAmounts({ total_points: 1100, usable_points: 100 });
    expect(amounts).toEqual({ total: 1100, usable: 100 });
    const fb = giftPurchaseErrorFallbacks(key, amounts);
    expect(fb.fallbackKo).toContain("1,100P");
    expect(fb.fallbackKo).toContain("100P");
    expect(fb.fallbackEn).toContain("1,100P");
    expect(fb.vars).toEqual({ total: "1,100", usable: "100" });
    expect(readGiftPurchaseErrorAmounts({ error: "x" })).toBeNull();
  });

  it("other gift errors keep existing mapping", () => {
    expect(mapGiftPurchaseErrorKey("insufficient_balance")).toBe("gift_u2_err_insufficient");
    expect(mapGiftPurchaseErrorKey("product_mall_hidden")).toBe("gift_u2_err_unavailable");
  });
});
