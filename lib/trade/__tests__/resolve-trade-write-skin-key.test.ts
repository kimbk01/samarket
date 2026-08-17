import { describe, expect, it } from "vitest";
import {
  isRentCarTradeWriteSkin,
  isUsedCarTradeWriteSkin,
  resolveTradeWriteSkinKey,
} from "@/lib/trade/resolve-trade-write-skin-key";

describe("resolveTradeWriteSkinKey", () => {
  it("maps car → used-car and rental-car → rent-car", () => {
    expect(resolveTradeWriteSkinKey("car")).toBe("used-car");
    expect(resolveTradeWriteSkinKey("rental-car")).toBe("rent-car");
    expect(resolveTradeWriteSkinKey("rent-car")).toBe("rent-car");
    expect(resolveTradeWriteSkinKey("used-car")).toBe("used-car");
  });

  it("helpers recognize aliases", () => {
    expect(isUsedCarTradeWriteSkin("car")).toBe(true);
    expect(isRentCarTradeWriteSkin("rental-car")).toBe(true);
    expect(isRentCarTradeWriteSkin(resolveTradeWriteSkinKey("rental-car"))).toBe(true);
  });
});
