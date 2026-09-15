import { describe, expect, it, vi } from "vitest";
import {
  confirmedSaleRevenuePhp,
  sumConfirmedSaleRevenuePhp,
} from "@/lib/stores/confirmed-sale-revenue";
import { sumTodayCompletedSalesForStore } from "@/lib/stores/owner-store-dashboard-kpi-queries";
import { sumYesterdayCompletedSalesForStore } from "@/lib/stores/owner-store-ops-queries";

/** Business contract: KPI must not treat payment_amount as full merchant sales. */
describe("merchant sales KPI — confirmed revenue (gift/platform)", () => {
  const noGift = {
    payment_amount: 1900,
    gift_redemption_amount: 0,
    platform_funded_amount: 0,
    order_status: "completed",
  };
  const withGift = {
    payment_amount: 900,
    gift_redemption_amount: 1000,
    platform_funded_amount: 0,
    order_status: "completed",
  };
  const withPlatform = {
    payment_amount: 900,
    gift_redemption_amount: 500,
    platform_funded_amount: 500,
    order_status: "completed",
  };

  it("CASE A — no gift: sales = 1900", () => {
    expect(confirmedSaleRevenuePhp(noGift)).toBe(1900);
    expect(sumConfirmedSaleRevenuePhp([noGift])).toBe(1900);
  });

  it("CASE B — gift: sales = 1900 (not payment_amount 900)", () => {
    expect(confirmedSaleRevenuePhp(withGift)).toBe(1900);
    expect(sumConfirmedSaleRevenuePhp([withGift])).toBe(1900);
    expect(Math.round(Number(withGift.payment_amount))).toBe(900);
  });

  it("CASE C — platform funded: sales = 1900", () => {
    expect(confirmedSaleRevenuePhp(withPlatform)).toBe(1900);
    expect(sumConfirmedSaleRevenuePhp([withPlatform])).toBe(1900);
  });

  it("aggregates mixed completed rows with gift contribution", () => {
    expect(sumConfirmedSaleRevenuePhp([noGift, withGift])).toBe(3800);
  });

  function mockCompletedSelect(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.eq = vi.fn(self);
    chain.gte = vi.fn(self);
    chain.lte = vi.fn(self);
    chain.then = undefined;
    // terminal: last call resolves via awaiting the builder — supabase client returns promise-like
    Object.assign(chain, {
      then: undefined,
    });
    const result = Promise.resolve({ data: rows, error: null });
    // Make chain thenable so `await sb.from().select()...` works
    (chain as { then: typeof result.then }).then = result.then.bind(result);
    return {
      from: vi.fn(() => chain),
    };
  }

  it("sumTodayCompletedSalesForStore uses confirmed revenue (gift case)", async () => {
    const sb = mockCompletedSelect([withGift]) as never;
    await expect(sumTodayCompletedSalesForStore(sb, "store-1")).resolves.toBe(1900);
  });

  it("sumYesterdayCompletedSalesForStore uses confirmed revenue (gift case)", async () => {
    const sb = mockCompletedSelect([withGift]) as never;
    await expect(sumYesterdayCompletedSalesForStore(sb, "store-1")).resolves.toBe(1900);
  });
});
