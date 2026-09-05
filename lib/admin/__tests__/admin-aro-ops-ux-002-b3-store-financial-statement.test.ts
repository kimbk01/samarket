import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("ARO-OPS-UX-002-B3 store financial statement", () => {
  it("read-model + API + UI exist without new finance DB/mutation owners", () => {
    expect(existsSync(resolve(process.cwd(), "lib/admin/store-financial-statement/load-store-financial-statement.ts"))).toBe(
      true
    );
    expect(existsSync(resolve(process.cwd(), "app/api/admin/store-financial-statement/route.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "components/admin/finance/AdminStoreFinancialStatement.tsx"))).toBe(
      true
    );

    const loader = read("lib/admin/store-financial-statement/load-store-financial-statement.ts");
    expect(loader).toContain("store_settlements");
    expect(loader).toContain("store_economic_point_ledger");
    expect(loader).toContain("business_cash_ledger");
    expect(loader).toContain("store_sale_fee_obligations");
    expect(loader).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    expect(loader).not.toMatch(/create table|CREATE TABLE/i);

    const api = read("app/api/admin/store-financial-statement/route.ts");
    expect(api).toContain("loadStoreFinancialStatement");
    expect(api).toContain('requireAdminPermission("business")');
    expect(api).not.toMatch(/method === ["']POST["']/i);

    const ui = read("components/admin/finance/AdminStoreFinancialStatement.tsx");
    expect(ui).toContain('data-aro-ops-ux-002-b3="1"');
    expect(ui).toContain("UNAVAILABLE");
    expect(ui).toContain("feeRatePercent");
    expect(ui).toContain("obligations");
    expect(ui).not.toMatch(/order total.*\*.*fee|sales\s*\*\s*0\.|guessed/i);
  });

  it("wires into existing finance route (no parallel store-finance-v2)", () => {
    const panels = read("components/admin/finance/AdminStoreFinancePanels.tsx");
    expect(panels).toContain("AdminStoreFinancialStatement");
    expect(existsSync(resolve(process.cwd(), "app/admin/store-finance-v2"))).toBe(false);
    expect(businessCcFinancialStatementHref("s1")).toBe("/admin/finance?storeId=s1&view=statement");
  });

  it("entry points: business hub, settlements, delivery dashboard, cash charges", () => {
    const hub = read("components/admin/business/AdminBusinessOpsOverview.tsx");
    expect(hub).toContain("businessCcFinancialStatementHref");
    expect(hub).toContain("data-store-hub-financial-statement");

    const settlements = read("components/admin/stores/AdminStoreSettlementsPage.tsx");
    expect(settlements).toContain("businessCcFinancialStatementHref");

    const delivery = read("lib/admin/domain-dashboard/load-delivery-domain-dashboard.ts");
    expect(delivery).toContain("store_financial_statement");

    const cash = read("components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx");
    expect(cash).toContain("view=statement");
  });

  it("period resolver keeps today/7d/30d semantics", () => {
    const today = resolveStoreFinancialPeriod({ period: "today" });
    expect(today.key).toBe("today");
    expect(today.fromDay).toBe(today.toDay);

    const d7 = resolveStoreFinancialPeriod({ period: "7d" });
    expect(d7.key).toBe("7d");
    expect(d7.fromDay <= d7.toDay).toBe(true);

    const d30 = resolveStoreFinancialPeriod({ period: "30d" });
    expect(d30.key).toBe("30d");
  });

  it("fee rows use settlement snapshot fields — not live policy multiply", () => {
    const loader = read("lib/admin/store-financial-statement/load-store-financial-statement.ts");
    expect(loader).toContain("platform_fee_percent/amount");
    expect(loader).toContain("f.commission_rate");
    expect(loader).toContain("f.commission_amount");
    expect(loader).not.toMatch(/defaultFeeRate|DEFAULT_FEE|fee_rate\s*\*\s*sale/i);
  });
});
