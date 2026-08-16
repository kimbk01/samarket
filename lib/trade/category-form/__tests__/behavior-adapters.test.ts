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
});
