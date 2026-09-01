import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("currency-visual-ssot-contract", () => {
  it("design tokens define currency families", () => {
    const tokens = read("app/design-tokens.css");
    expect(tokens).toContain("--currency-point-accent");
    expect(tokens).toContain("--currency-coin-accent");
    expect(tokens).toContain("--currency-cash-accent");
  });

  it("currency components exist and enforce variants", () => {
    expect(read("components/currency/CurrencyBalanceCard.tsx")).toContain("CurrencyVisualVariant");
    expect(read("components/currency/CurrencyBalanceCard.tsx")).toContain("currency-card--point");
    expect(read("components/currency/CurrencyActionGroup.tsx")).toContain("CURRENCY_ALLOWED_ACTIONS");
    expect(read("components/currency/CurrencyHistoryRow.tsx")).toContain("CurrencyBadge");
  });

  it("Owner Finance uses canonical currency cards", () => {
    const finance = read("components/business/owner/OwnerStoreFinanceView.tsx");
    expect(finance).toContain('currency="coin"');
    expect(finance).toContain('currency="cash"');
    expect(finance).toContain("CurrencyBalanceCard");
  });

  it("Ads hub is Cash consumer not wallet owner", () => {
    const hub = read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
    expect(hub).toContain("data-owner-ads-cash-consumer");
    expect(hub).toContain("OwnerRoutes.finance");
  });

  it("Point member card uses blue family", () => {
    expect(read("components/mypage/MyPointCard.tsx")).toContain("currency-card--point");
  });

  it("active docs forbid legacy currency UI and writers", () => {
    const lock = read("docs/dibay-currency-ssot-hard-lock.md");
    expect(lock).toContain("no historical currency may remain reachable through an active UI/reader");
    expect(lock).toContain("Any new writer to `delivery_ad_accounts` or `store_cash_accounts`");
  });
});
