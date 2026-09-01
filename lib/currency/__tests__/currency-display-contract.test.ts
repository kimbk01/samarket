import { describe, expect, it } from "vitest";
import {
  formatCurrencyAmount,
  isCurrencyActionAllowed,
  coinMustNotUsePSuffix,
} from "@/lib/currency/currency-display-contract";

describe("currency-display-contract", () => {
  it("formats Point with P suffix when compact", () => {
    expect(formatCurrencyAmount({ currency: "point", amount: 3200, compactPoint: true })).toBe(
      "3,200P"
    );
  });

  it("formats Coin without P suffix", () => {
    const s = formatCurrencyAmount({ currency: "coin", amount: 12500 });
    expect(s).toContain("Coin");
    expect(s).not.toMatch(/\dP\b/);
  });

  it("formats Cash from minor units", () => {
    expect(formatCurrencyAmount({ currency: "cash", amount: 840000, isMinor: true })).toMatch(/₱/);
  });

  it("Coin cannot recharge", () => {
    expect(isCurrencyActionAllowed("coin", "recharge")).toBe(false);
  });

  it("Cash cannot withdraw", () => {
    expect(isCurrencyActionAllowed("cash", "withdraw")).toBe(false);
  });

  it("detects ambiguous P suffix on coin-like display", () => {
    expect(coinMustNotUsePSuffix("12,500 Coin")).toBe(true);
    expect(coinMustNotUsePSuffix("999,990P")).toBe(false);
  });
});
