import { describe, expect, it } from "vitest";
import {
  applyTradeBehaviorAdapter,
  resolveTradeComposition,
} from "@/lib/trade/category-form";

describe("trade behavior adapters", () => {
  it("used-car buy hides make/mileage and requires body_type", () => {
    const c = resolveTradeComposition({ icon_key: "used-car" });
    const adapted = applyTradeBehaviorAdapter(c, { carTrade: "buy" });
    expect(adapted.find((f) => f.id === "make")?.visible).toBe(false);
    expect(adapted.find((f) => f.id === "mileage")?.visible).toBe(false);
    expect(adapted.find((f) => f.id === "body_type")?.effectiveRequired).toBe(true);
    expect(adapted.find((f) => f.id === "transmission")?.visible).toBe(false);
  });

  it("real-estate rent requires deposit/monthly not price", () => {
    const c = resolveTradeComposition({ icon_key: "real-estate" });
    const adapted = applyTradeBehaviorAdapter(c, { dealType: "임대" });
    expect(adapted.find((f) => f.id === "price")?.visible).toBe(false);
    expect(adapted.find((f) => f.id === "deposit")?.effectiveRequired).toBe(true);
    expect(adapted.find((f) => f.id === "monthly")?.effectiveRequired).toBe(true);
  });

  it("jobs work_category_other visible only when category is 기타", () => {
    const c = resolveTradeComposition({ icon_key: "jobs" });
    const hidden = applyTradeBehaviorAdapter(c, {
      listingKind: "hire",
      workCategory: "서빙",
    });
    expect(hidden.find((f) => f.id === "work_category_other")?.visible).toBe(false);
    const shown = applyTradeBehaviorAdapter(c, {
      listingKind: "hire",
      workCategory: "기타",
    });
    expect(shown.find((f) => f.id === "work_category_other")?.visible).toBe(true);
    expect(shown.find((f) => f.id === "work_category_other")?.effectiveRequired).toBe(true);
  });

  it("rent-car adapter keeps daily_price required and visible", () => {
    const c = resolveTradeComposition({ icon_key: "rent-car" });
    expect(c.layoutVariant).toBe("rental-card");
    const adapted = applyTradeBehaviorAdapter(c, {});
    expect(adapted.find((f) => f.id === "daily_price")?.visible).toBe(true);
    expect(adapted.find((f) => f.id === "daily_price")?.effectiveRequired).toBe(true);
    expect(adapted.find((f) => f.id === "pickup_location")?.effectiveRequired).toBe(true);
  });

  it("rent-car seed includes vehicle + rental fields only from Field Library", () => {
    const c = resolveTradeComposition({ icon_key: "rent-car", fieldComposition: null });
    expect(c.source).toBe("product_seed");
    expect(c.fields.every((f) => f.definition)).toBe(true);
    expect(c.fields.some((f) => f.id === "make")).toBe(true);
    expect(c.fields.some((f) => f.id === "with_driver")).toBe(true);
    expect(c.fields.some((f) => f.id === "car_trade")).toBe(false);
  });
});
