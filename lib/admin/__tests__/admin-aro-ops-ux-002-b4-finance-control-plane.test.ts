import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("ARO-OPS-UX-002-B4 common finance control plane", () => {
  it("read-model + API + UI exist without new finance DB/mutation", () => {
    expect(existsSync(resolve(process.cwd(), "lib/admin/finance-control-plane/load-finance-control-plane.ts"))).toBe(
      true
    );
    expect(existsSync(resolve(process.cwd(), "app/api/admin/finance-control-plane/route.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "components/admin/finance/AdminFinanceControlPlane.tsx"))).toBe(true);

    const loader = read("lib/admin/finance-control-plane/load-finance-control-plane.ts");
    expect(loader).toContain("point_charge_requests");
    expect(loader).toContain("business_cash_ledger");
    expect(loader).toContain("store_economic_point_ledger");
    expect(loader).toContain("store_sale_fee_obligations");
    expect(loader).toContain("businessCcFinancialStatementHref");
    expect(loader).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    expect(loader).not.toMatch(/CREATE TABLE/i);

    const ui = read("components/admin/finance/AdminFinanceControlPlane.tsx");
    expect(ui).toContain('data-aro-ops-ux-002-b4="1"');
    expect(ui).toContain("action-required");
    expect(ui).toContain("UNAVAILABLE");
    expect(ui).toContain("CurrencyBadge");
    expect(ui).not.toMatch(/총 자산|total assets|merge.*Point.*Coin.*Cash/i);
  });

  it("finance hub mounts Control Plane before store tools; B3 statement stays separate", () => {
    const panels = read("components/admin/finance/AdminStoreFinancePanels.tsx");
    expect(panels).toContain("AdminFinanceControlPlane");
    expect(panels).toContain("AdminStoreFinancialStatement");
    expect(panels.indexOf("AdminFinanceControlPlane")).toBeLessThan(
      panels.indexOf("AdminStoreFinancialStatement")
    );
  });

  it("Action Center + Delivery deep-link to finance control plane", () => {
    const ac = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(ac).toContain('/admin/finance#action-required');
    const delivery = read("lib/admin/domain-dashboard/load-delivery-domain-dashboard.ts");
    expect(delivery).toContain('/admin/finance#action-required');
    expect(delivery).toContain('id: "store_financial_statement"');
    expect(delivery).toContain('href: "/admin/finance"');
  });

  it("keeps Point/Coin/Cash/Settlement as separate queue owners", () => {
    const loader = read("lib/admin/finance-control-plane/load-finance-control-plane.ts");
    expect(loader).toContain('currency: "POINT"');
    expect(loader).toContain('currency: "COIN"');
    expect(loader).toContain('currency: "CASH"');
    expect(loader).toContain('currency: "PHP_SETTLEMENT"');
  });
});
