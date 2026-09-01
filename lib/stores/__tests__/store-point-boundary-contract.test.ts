import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const path = (relative: string) => resolve(root, relative);

describe("historical store-credit boundary", () => {
  it("returns gone for former Owner recharge and balance APIs", () => {
    for (const route of [
      "app/api/me/stores/[storeId]/points/route.ts",
      "app/api/me/stores/[storeId]/point-charges/route.ts",
    ]) {
      const source = readFileSync(path(route), "utf8");
      expect(source).toContain("historical_store_credit_product_removed");
      expect(source).toContain("status: 410");
    }
  });

  it("has no order-accept debit writer", () => {
    const transition = readFileSync(
      path("lib/stores/apply-store-order-status-transition.ts"),
      "utf8"
    );
    expect(transition).not.toContain("chargeStorePointsOnOrderAccept");
    expect(transition).not.toContain("charge_store_points_on_order_accept");
  });

  it("revokes historical writer functions from every runtime role", () => {
    const migration = readFileSync(
      path("supabase/migrations/20261202140000_three_currency_legacy_writer_kill.sql"),
      "utf8"
    );
    for (const writer of [
      "charge_store_points_on_order_accept",
      "approve_store_point_charge_request",
      "adjust_store_point_balance",
    ]) {
      expect(migration).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${writer}[\\s\\S]*?service_role`)
      );
    }
  });
});
