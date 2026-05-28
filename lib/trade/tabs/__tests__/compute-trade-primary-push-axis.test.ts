import { describe, expect, it } from "vitest";
import { computeTradePrimaryPushAxis } from "@/lib/trade/tabs/compute-trade-primary-push-axis";

describe("computeTradePrimaryPushAxis", () => {
  it("returns null when indices are equal or invalid", () => {
    expect(computeTradePrimaryPushAxis(0, 0)).toBeNull();
    expect(computeTradePrimaryPushAxis(-1, 2)).toBeNull();
    expect(computeTradePrimaryPushAxis(1, -1)).toBeNull();
  });

  it("rtl when moving to a higher tab index (우측 탭, 우→좌)", () => {
    expect(computeTradePrimaryPushAxis(0, 3)).toBe("rtl");
  });

  it("ltr when moving to a lower tab index (좌측 탭, 좌→우)", () => {
    expect(computeTradePrimaryPushAxis(4, 1)).toBe("ltr");
  });
});
