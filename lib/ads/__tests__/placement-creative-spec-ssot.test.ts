import { describe, expect, it } from "vitest";
import {
  deliveryBannerCreativeSpec,
  feedBannerCreativeSpec,
  platformPopupCreativeSpec,
} from "@/lib/ads/placement-creative-spec-ssot";

describe("placement creative spec SSOT", () => {
  it("delivery HERO / INLINE_1 / CATEGORY_TOP from pixel guide", () => {
    expect(deliveryBannerCreativeSpec("STORES_HOME_HERO")?.ratioLabel).toBe("39:16");
    expect(deliveryBannerCreativeSpec("STORES_HOME_INLINE_1")?.ratioLabel).toBe("2:1");
    expect(deliveryBannerCreativeSpec("STORES_CATEGORY_TOP")?.recommendedWidth).toBe(1536);
    expect(deliveryBannerCreativeSpec("UNKNOWN")).toBeNull();
  });

  it("feed banner uses geometry SSOT", () => {
    const trade = feedBannerCreativeSpec("trade");
    expect(trade.ratioLabel).toBe("3:1");
    expect(trade.recommendedWidth).toBe(1200);
    expect(trade.cropCapable).toBe(true);
  });

  it("popup uses canonical 36:25 px", () => {
    const popup = platformPopupCreativeSpec();
    expect(popup.recommendedWidth).toBe(1440);
    expect(popup.recommendedHeight).toBe(1000);
    expect(popup.cropCapable).toBe(true);
  });
});
