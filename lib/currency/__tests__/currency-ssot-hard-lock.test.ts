import { describe, expect, it } from "vitest";
import {
  assertCurrencySsotHardLockAnchors,
  CURRENCY_AUTHORITY,
  COIN_REFUND_ECONOMIC_UNWIND_CONTRACT,
  GIFT_CASH_OUT_MERGED_INTO_COIN_WITHDRAWAL,
} from "@/lib/currency/currency-ssot-hard-lock";

describe("currency-ssot-hard-lock", () => {
  it("anchors pass", () => {
    expect(assertCurrencySsotHardLockAnchors()).toBe(true);
  });

  it("COIN cannot recharge", () => {
    expect(CURRENCY_AUTHORITY.COIN.recharge).toBe(false);
  });

  it("CASH cannot withdraw", () => {
    expect(CURRENCY_AUTHORITY.CASH.withdraw).toBe(false);
  });

  it("gift cash-out merges into coin withdrawal", () => {
    expect(GIFT_CASH_OUT_MERGED_INTO_COIN_WITHDRAWAL).toBe(true);
  });

  it("F-05 refund unwind: Coin REVERSAL + negative debt, no Cash clawback", () => {
    expect(COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.cashClawback).toBe(false);
    expect(COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.insufficientCoinOnRefund).toBe(
      "NEGATIVE_COIN_DEBT_ALLOWED"
    );
  });
});
