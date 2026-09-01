import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("three-currency legacy product kill", () => {
  const migration = read(
    "supabase/migrations/20261202140000_three_currency_legacy_writer_kill.sql"
  );

  it.each([
    "charge_store_points_on_order_accept",
    "approve_store_point_charge_request",
    "adjust_store_point_balance",
    "gift_certificate_conversion_request",
    "gift_certificate_conversion_approve",
    "gift_certificate_cash_out_request",
    "gift_certificate_cash_out_cancel",
    "gift_certificate_cash_out_reject",
    "gift_certificate_cash_out_approve",
    "gift_certificate_cash_out_mark_paid",
    "store_cash_recovery_clear",
    "store_cash_delivery_ad_spend",
    "store_cash_delivery_ad_refund",
    "owner_fund_delivery_ad_campaign",
    "delivery_ad_business_cash_ensure_account",
    "admin_delivery_ad_business_cash_credit",
    "admin_refund_delivery_ad_campaign_funding",
    "delivery_ad_reconcile_charge",
    "delivery_ad_reconcile_refund",
  ])("revokes the legacy writer %s from service_role", (name) => {
    const statement = new RegExp(
      `REVOKE ALL ON FUNCTION public\\.${name}[\\s\\S]*?service_role`,
      "m"
    );
    expect(migration).toMatch(statement);
  });

  it("removes the order-accept store-credit writer from runtime", () => {
    const transition = read("lib/stores/apply-store-order-status-transition.ts");
    expect(transition).not.toContain("chargeStorePointsOnOrderAccept");
    expect(transition).not.toContain("charge_store_points_on_order_accept");
  });
});
