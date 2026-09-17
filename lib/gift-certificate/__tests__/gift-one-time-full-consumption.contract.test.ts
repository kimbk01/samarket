import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GIFT_ONE_TIME_FULL_CONSUMPTION_MIGRATION_ID } from "@/lib/gift-certificate/gift-certificate-schema";
import {
  GIFT_FORFEITED_EXTINGUISH_AND_TRACE,
  GIFT_MERCHANT_REVENUE_APPLIED_ONLY,
  GIFT_ONE_TIME_FULL_CONSUMPTION,
  GIFT_PARTIAL_REDEMPTION_SUPPORTED,
  GIFT_REUSABLE_REMAINING_BALANCE_FORBIDDEN,
  computeGiftRedemptionSplit,
  giftInstanceAllowsRedeem,
  giftInstanceAllowsRegift,
  resolveGiftInstanceStatusAfterRedeem,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";

function mig(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      `supabase/migrations/${GIFT_ONE_TIME_FULL_CONSUMPTION_MIGRATION_ID}.sql`
    ),
    "utf8"
  );
}

describe("gift one-time full consumption migration + domain lock", () => {
  it("locks Owner GATE flags", () => {
    expect(GIFT_ONE_TIME_FULL_CONSUMPTION).toBe(true);
    expect(GIFT_PARTIAL_REDEMPTION_SUPPORTED).toBe(false);
    expect(GIFT_REUSABLE_REMAINING_BALANCE_FORBIDDEN).toBe(true);
    expect(GIFT_MERCHANT_REVENUE_APPLIED_ONLY).toBe(true);
    expect(GIFT_FORFEITED_EXTINGUISH_AND_TRACE).toBe(true);
  });

  it("UNDER / OVER / EXACT face splits", () => {
    expect(computeGiftRedemptionSplit({ amountDueBeforeGift: 800, giftRemaining: 1000 })).toEqual({
      redeemAmount: 800,
      remainingPayment: 0,
      giftRemainingAfter: 0,
      forfeitedAmount: 200,
    });
    expect(computeGiftRedemptionSplit({ amountDueBeforeGift: 1100, giftRemaining: 1000 })).toEqual({
      redeemAmount: 1000,
      remainingPayment: 100,
      giftRemainingAfter: 0,
      forfeitedAmount: 0,
    });
    expect(computeGiftRedemptionSplit({ amountDueBeforeGift: 1000, giftRemaining: 1000 })).toEqual({
      redeemAmount: 1000,
      remainingPayment: 0,
      giftRemainingAfter: 0,
      forfeitedAmount: 0,
    });
  });

  it("second redeem + regift blocked after use; historical PARTIAL blocked", () => {
    expect(resolveGiftInstanceStatusAfterRedeem(200)).toBe("FULLY_REDEEMED");
    expect(giftInstanceAllowsRedeem("FULLY_REDEEMED")).toBe(false);
    expect(giftInstanceAllowsRedeem("PARTIALLY_REDEEMED")).toBe(false);
    expect(giftInstanceAllowsRegift("FULLY_REDEEMED", true)).toBe(false);
    expect(giftInstanceAllowsRegift("PARTIALLY_REDEEMED", true)).toBe(false);
    expect(giftInstanceAllowsRedeem("ACTIVE")).toBe(true);
  });

  it("migration file exists and encodes forfeit + ACTIVE-only + reverse restore", () => {
    const path = resolve(
      process.cwd(),
      `supabase/migrations/${GIFT_ONE_TIME_FULL_CONSUMPTION_MIGRATION_ID}.sql`
    );
    expect(existsSync(path)).toBe(true);
    const sql = mig();
    expect(sql).toMatch(/forfeited_amount/);
    expect(sql).toMatch(/'FORFEIT'/);
    expect(sql).toMatch(/'FORFEIT_REVERSE'/);
    expect(sql).toMatch(/status IS DISTINCT FROM 'ACTIVE'/);
    expect(sql).toMatch(/v_gift_status := 'FULLY_REDEEMED'/);
    expect(sql).toMatch(/v_new_status := 'ACTIVE'/);
    expect(sql).toMatch(/coalesce\(v_red\.forfeited_amount, 0\)/);
    expect(sql).toMatch(/gift_certificate_offer/);
    expect(sql).toMatch(/status IS DISTINCT FROM 'ACTIVE'/);
  });
});
