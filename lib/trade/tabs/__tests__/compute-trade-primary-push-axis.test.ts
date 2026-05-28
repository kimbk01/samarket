import { describe, expect, it } from "vitest";
import { computeTradePrimaryPushAxis } from "@/lib/trade/tabs/compute-trade-primary-push-axis";

describe("computeTradePrimaryPushAxis", () => {
  it("returns null when indices are equal or invalid", () => {
    expect(computeTradePrimaryPushAxis(0, 0)).toBeNull();
    expect(computeTradePrimaryPushAxis(-1, 2)).toBeNull();
    expect(computeTradePrimaryPushAxis(1, -1)).toBeNull();
  });

  it("ltr when moving to a higher tab index", () => {
    expect(computeTradePrimaryPushAxis(0, 3)).toBe("ltr");
  });

  it("rtl when moving to a lower tab index", () => {
    expect(computeTradePrimaryPushAxis(4, 1)).toBe("rtl");
  });
});
