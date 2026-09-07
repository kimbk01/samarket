import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_FINANCE_NAV,
  financeAdsHref,
  financeCashHref,
  financeCoinHref,
  financeOrderHref,
  financeOutstandingHref,
  financePointHref,
  financeSettingsHref,
  financeStoreHref,
  financeTransactionDetailHref,
  financeTransactionListHref,
  financeWithdrawalsHref,
  ownerFinanceSectionHref,
  parseFinanceFilters,
} from "@/lib/finance/routes";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("finance UI route SSOT", () => {
  it("canonical admin destinations are unique per capability", () => {
    expect(financeTransactionListHref()).toBe("/admin/finance/transactions");
    expect(financePointHref()).toBe("/admin/finance/transactions?wallet=POINT");
    expect(financeCoinHref()).toBe("/admin/finance/transactions?wallet=COIN");
    expect(financeCashHref()).toBe("/admin/finance/transactions?wallet=CASH");
    expect(financeOutstandingHref()).toBe("/admin/finance/outstanding");
    expect(financeAdsHref()).toBe("/admin/finance/ads");
    expect(financeWithdrawalsHref()).toBe("/admin/finance/withdrawals");
    expect(financeSettingsHref()).toBe("/admin/finance/settings");
    expect(financeStoreHref("s1", { period: "30d" })).toBe("/admin/finance/stores/s1?period=30d");
    expect(financeOrderHref("o1")).toBe("/admin/finance/orders/o1");
    expect(financeTransactionDetailHref("cash:abc", { wallet: "CASH" })).toBe(
      "/admin/finance/transactions/cash%3Aabc?wallet=CASH"
    );
  });

  it("today summary CTA routes use date=today + direction helpers", async () => {
    const {
      financeCashInTodayHref,
      financeCashOutTodayHref,
      financeCoinEarnedTodayHref,
    } = await import("@/lib/finance/routes");
    expect(financeCashInTodayHref()).toContain("wallet=CASH");
    expect(financeCashInTodayHref()).toContain("direction=CREDIT");
    expect(financeCashInTodayHref()).toContain("date=today");
    expect(financeCashOutTodayHref()).toContain("direction=DEBIT");
    expect(financeCoinEarnedTodayHref()).toContain("type=SALE_EARN");
    expect(financeCoinEarnedTodayHref()).toContain("date=today");
  });

  it("filter parse/restore round-trip", () => {
    const sp = new URLSearchParams("wallet=CASH&storeId=s1&from=2026-01-01&type=AD_SPEND");
    const f = parseFinanceFilters(sp);
    expect(f.wallet).toBe("CASH");
    expect(f.storeId).toBe("s1");
    expect(financeCashHref(f)).toContain("wallet=CASH");
    expect(financeCashHref(f)).toContain("storeId=s1");
    expect(financeCashHref(f)).toContain("from=2026-01-01");
  });

  it("owner section href keeps storeId across tabs", () => {
    expect(ownerFinanceSectionHref("s1", "coin")).toBe(
      "/stores/owner/finance?storeId=s1&section=coin"
    );
    expect(ownerFinanceSectionHref("s2", "convert")).toContain("section=convert");
  });

  it("admin nav covers LIST IA leaves", () => {
    const keys = ADMIN_FINANCE_NAV.map((n) => n.key);
    expect(keys).toEqual([
      "transactions",
      "stores",
      "orders",
      "point",
      "coin",
      "cash",
      "outstanding",
      "ads",
      "conversions",
      "withdrawals",
      "settings",
    ]);
  });

  it("deep-links + menu leave legacy view=ledger paths", () => {
    expect(read("lib/finance/deep-links.ts")).toContain("financeTransactionListHref");
    expect(read("lib/finance/deep-links.ts")).not.toContain('qs.set("view", "ledger")');
    expect(read("components/admin/admin-menu.ts")).toContain(
      "/admin/finance/transactions?wallet=COIN"
    );
    expect(read("app/admin/store-point-ledger/page.tsx")).toContain(
      "/admin/finance/transactions?wallet=COIN"
    );
    expect(read("components/finance/FinanceTransactionList.tsx")).toContain(
      "financeTransactionDetailHref"
    );
    expect(read("components/finance/FinanceTransactionDetail.tsx")).not.toMatch(
      /\[관리\]|\"관리\"|\"보기\"|\"처리\"/
    );
  });
});
