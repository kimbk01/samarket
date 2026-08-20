import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Slice 4 — DELIVERY vertical presentation honesty (writers untouched).
 */
describe("Admin Delivery vertical hollow presentation contract", () => {
  it("order list does not render hollow settlement/report as truth columns", () => {
    const table = read("components/admin/delivery-orders/OrderTable.tsx");
    expect(table).not.toContain("SettlementStatusBadge");
    expect(table).not.toContain("o.hasReport");
    expect(table).toContain("/admin/stores/orders/");
    expect(table).toContain("/admin/store-orders?order_id=");
  });

  it("order filters do not expose hollow settlement/report filters", () => {
    const bar = read("components/admin/delivery-orders/OrderFilterBar.tsx");
    expect(bar).not.toContain("settlementStatus");
    expect(bar).not.toContain("reportsOnly");
    expect(bar).not.toContain("heldSettlementOnly");
    expect(bar).toContain("/admin/store-settlements");
    expect(bar).toContain("/admin/store-reports");
    const match = read("lib/admin/admin-delivery-order-filters.ts");
    expect(match).not.toMatch(/o\.hasReport/);
    expect(match).not.toMatch(/o\.settlementStatus !== f\.settlementStatus/);
  });

  it("KPI does not invent settlement amounts from hollow projection", () => {
    const kpi = read("components/admin/delivery-orders/DeliveryOrdersKpiCards.tsx");
    expect(kpi).not.toContain('settlementStatus === "scheduled"');
    expect(kpi).not.toContain('settlementStatus === "held"');
    expect(kpi).toContain("/admin/store-settlements");
  });

  it("dashboard nav points at real settlement/report ledgers", () => {
    const dash = read("components/admin/delivery-orders/DeliveryOrdersDashboardClient.tsx");
    expect(dash).toContain('href: "/admin/store-settlements"');
    expect(dash).toContain('href: "/admin/store-reports"');
    expect(dash).not.toContain('href: "/admin/stores/orders/settlements"');
  });

  it("action-queue menu leaf has distinct role label key", () => {
    const menu = read("components/admin/admin-menu.ts");
    expect(menu).toContain(
      '"delivery-orders-action-queue": "admin_menu_store_orders_action_queue"'
    );
  });

  it("quarantines hollow DeliverySettlementsClient residual", () => {
    const orphan = read("components/admin/delivery-orders/DeliverySettlementsClient.tsx");
    expect(orphan).toMatch(/ORPHAN|QUARANTINE/);
  });

  it("mapper keeps hollow constants without inventing FK", () => {
    const map = read("lib/admin/map-store-order-to-admin-delivery.ts");
    expect(map).toContain('settlementStatus: "unknown"');
    expect(map).toContain("hasReport: false");
    expect(map).toMatch(/store_settlements/);
    expect(map).toMatch(/no FK/i);
  });
});
