import { describe, expect, it } from "vitest";
import {
  decodePointFinancialCursor,
  encodePointFinancialCursor,
  normalizePointFinancialCategory,
  normalizePointFinancialDirection,
  pointFinancialDayKey,
  promotionProductDisplayLabel,
} from "@/lib/points/point-financial-history";

describe("point-financial-history normalize", () => {
  it("maps promotion_order spend to PROMOTION", () => {
    expect(normalizePointFinancialCategory("spend", "promotion_order")).toBe("PROMOTION");
  });

  it("maps charge and point_charge to CHARGE", () => {
    expect(normalizePointFinancialCategory("charge", "point_charge")).toBe("CHARGE");
  });

  it("maps refunds and ad_refund to REFUND", () => {
    expect(normalizePointFinancialCategory("refund", "admin_manual")).toBe("REFUND");
    expect(normalizePointFinancialCategory("ad_refund", "ad_application")).toBe("REFUND");
  });

  it("does not collapse ad_purchase into PROMOTION", () => {
    expect(normalizePointFinancialCategory("ad_purchase", "trade_post_ad")).toBe(
      "ADVERTISEMENT_USAGE"
    );
  });

  it("direction from signed amount", () => {
    expect(normalizePointFinancialDirection(-500)).toBe("debit");
    expect(normalizePointFinancialDirection(10000)).toBe("credit");
  });

  it("promotion product labels never expose trade_promote_* as primary", () => {
    expect(promotionProductDisplayLabel("trade_promote_7", 7).ko).toBe("7일 홍보");
    expect(promotionProductDisplayLabel("trade_promote_14", 14).en).toBe("14-day promotion");
  });

  it("cursor round-trip preserves created_at + id", () => {
    const c = { createdAt: "2026-08-07T07:30:00.000Z", id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };
    const enc = encodePointFinancialCursor(c);
    expect(decodePointFinancialCursor(enc)).toEqual(c);
  });

  it("day key uses timezone offset (not raw UTC slice)", () => {
    // 2026-08-07 01:00 UTC → Asia/Manila UTC+8 → still Aug 7
    expect(pointFinancialDayKey("2026-08-07T01:00:00.000Z", -480)).toBe("2026-08-07");
    // 2026-08-06 20:00 UTC → Manila Aug 7
    expect(pointFinancialDayKey("2026-08-06T20:00:00.000Z", -480)).toBe("2026-08-07");
  });
});
