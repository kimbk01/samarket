import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AD_NORMAL_EXPIRY_REFUND,
  CASH_WITHDRAWAL_PRODUCT_EXISTS,
  OWNER_POPUP_CASH_NEW_SALES_CLOSED,
  POPUP_SELLABLE,
  TRADE_POST_ADS_NEW_WRITES_ENABLED,
} from "@/lib/finance/product-decision-lock";
import { mayRefundAdFunding } from "@/lib/finance/ad-refund-policy";
import { assertTradePostAdsNewWriteAllowed } from "@/lib/trade-ads/trade-post-ads-legacy-gate";
import { OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED } from "@/lib/platform-popup/owner-popup-new-sales-gate";
import { ADS_CANONICAL_PRODUCTS } from "@/lib/ads/ads-canonical-product-ssot";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("finance × ads product decision lock", () => {
  it("AD-P0-1 popup owner cash new sales closed", () => {
    expect(OWNER_POPUP_CASH_NEW_SALES_CLOSED).toBe(true);
    expect(POPUP_SELLABLE).toBe(false);
    expect(OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED).toBe(false);
    expect(ADS_CANONICAL_PRODUCTS.popup.sellable).toBe(false);
    expect(ADS_CANONICAL_PRODUCTS.popup.currency).toBe("N_A");
  });

  it("AD-P0-2 normal expiry is never refund", () => {
    expect(AD_NORMAL_EXPIRY_REFUND).toBe(false);
    expect(mayRefundAdFunding("admin_reject")).toBe(true);
    expect(mayRefundAdFunding("user_cancel_before_capture")).toBe(true);
    const endSrc = read("lib/ads/end-feed-ad-campaign.ts");
    expect(endSrc).toMatch(/NO automatic Point refund/i);
  });

  it("AD-P0-3 trade_post_ads new writes blocked", () => {
    expect(TRADE_POST_ADS_NEW_WRITES_ENABLED).toBe(false);
    expect(assertTradePostAdsNewWriteAllowed().ok).toBe(false);
    const apply = read("app/api/posts/[postId]/trade-ads/apply/route.ts");
    expect(apply).toContain("assertTradePostAdsNewWriteAllowed");
    expect(apply).toContain("410");
  });

  it("AD-P0-4 finance↔ad deep-links exist", () => {
    const links = read("lib/finance/deep-links.ts");
    expect(links).toContain("adminAdDetailHref");
    expect(links).toContain("adminFinanceLedgerHref");
    expect(links).toContain("ownerFinanceLedgerHref");
    expect(links).toContain("financeTransactionListHref");
    expect(links).not.toContain('qs.set("view", "ledger")');
  });

  it("conversion ≠ cash withdrawal", () => {
    expect(CASH_WITHDRAWAL_PRODUCT_EXISTS).toBe(false);
  });

  it("legacy store-point-ledger redirects to finance", () => {
    const page = read("app/admin/store-point-ledger/page.tsx");
    expect(page).toContain('redirect("/admin/finance');
  });

  it("shared read models exist without new balance tables", () => {
    expect(read("lib/finance/ad-funding-trace/load-ad-funding-trace.ts")).toContain("loadAdFundingTraces");
    expect(read("lib/finance/order-money-chain/load-order-money-chain.ts")).toContain("loadOrderMoneyChain");
    expect(read("lib/finance/store-statement/load-store-statement.ts")).toContain("loadStoreStatement");
    const mig = read("supabase/migrations/20261208120000_coin_cash_conversion_policy_limits.sql");
    expect(mig).toContain("minimum_coin_per_conversion");
    expect(mig).not.toContain("CREATE TABLE.*unified");
  });
});
