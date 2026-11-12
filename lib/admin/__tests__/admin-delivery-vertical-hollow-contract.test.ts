import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Slice 4 — DELIVERY vertical presentation honesty (writers untouched).
 */
describe("Admin Delivery vertical hollow presentation contract", () => {
  it("action-queue menu leaf has distinct role label key", () => {
    const menu = read("components/admin/admin-menu.ts");
    expect(menu).toContain(
      '"delivery-orders-action-queue": "admin_menu_store_orders_action_queue"'
    );
  });

  it("mapper keeps hollow constants without inventing FK", () => {
    const map = read("lib/admin/map-store-order-to-admin-delivery.ts");
    expect(map).toContain('settlementStatus: "unknown"');
    expect(map).toContain("hasReport: false");
    expect(map).toMatch(/store_settlements/);
    expect(map).toMatch(/no FK/i);
  });
});
