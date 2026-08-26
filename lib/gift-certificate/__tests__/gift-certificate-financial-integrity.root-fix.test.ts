import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIFT_CHECKOUT_REFUND_MIGRATION_ID,
  GIFT_MIGRATION_ID,
  GIFT_RPCS,
} from "@/lib/gift-certificate/gift-certificate-schema";

function readMig(id: string) {
  return readFileSync(resolve(process.cwd(), `supabase/migrations/${id}.sql`), "utf8");
}

describe("Gift financial integrity root fix contracts T1–T16 (static)", () => {
  const g2 = readMig(GIFT_MIGRATION_ID);
  const g7 = readMig(GIFT_CHECKOUT_REFUND_MIGRATION_ID);
  const route = readFileSync(resolve(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
  const transition = readFileSync(
    resolve(process.cwd(), "lib/stores/apply-store-order-status-transition.ts"),
    "utf8"
  );

  it("T1/T2/T3: gift redeem folded into create_store_order_atomic (same TX)", () => {
    expect(g7).toMatch(/Gift redeem in same TX as order/);
    expect(g7).toMatch(/gift_instance_ids/);
    expect(g7).toMatch(/amount_before_gift/);
    expect(route).not.toMatch(/G7_PARTIAL_ATOMICITY/);
    expect(route).not.toMatch(/giftCertificateRedeem/);
  });

  it("T4: order idempotency does not skip gift via post-create redeem", () => {
    expect(route).not.toMatch(/G7_PARTIAL_ATOMICITY/);
    expect(route).not.toMatch(/giftCertificateRedeem/);
  });

  it("T5: gift row FOR UPDATE before debit in atomic order", () => {
    expect(g7).toMatch(/FROM public\.gift_certificate_instances[\s\S]*?FOR UPDATE/);
  });

  it("T6/T7: conversion approve validates before APPROVED terminal write", () => {
    const approveIdx = g2.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_conversion_approve");
    const approveBody = g2.slice(approveIdx, approveIdx + 3500);
    expect(approveBody).toMatch(/status = 'REQUESTED'[\s\S]*FOR UPDATE/);
    expect(approveBody).toMatch(/open_recovery_obligation/);
    expect(approveBody).toMatch(/insufficient_available_revenue/);
    expect(approveBody).toMatch(/GIFT_REVENUE_CONVERSION/);
    // Terminal APPROVED after cash ledger
    const cashIdx = approveBody.indexOf("GIFT_REVENUE_CONVERSION");
    const approvedIdx = approveBody.lastIndexOf("status = 'APPROVED'");
    expect(approvedIdx).toBeGreaterThan(cashIdx);
  });

  it("T8/T9: conversion uses advisory lock + unique cash ledger related_id", () => {
    expect(g2).toMatch(/pg_advisory_xact_lock\(hashtext\('gift_rev:'/);
    expect(g2).toMatch(/store_cash_ledger_source_related_uq/);
  });

  it("T10/T11: refund atomic RPC reverses gift before refunded terminal", () => {
    expect(g7).toMatch(/gift_certificate_refund_order_atomic/);
    expect(g7).toMatch(/gift_certificate_redemption_reverse/);
    const refundIdx = g7.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_refund_order_atomic");
    const body = g7.slice(refundIdx, refundIdx + 2500);
    const reverseCall = body.indexOf("gift_certificate_redemption_reverse(p_order_id)");
    // Terminal status write after reverse (exclude early idempotent SELECT branch)
    const statusRefunded = body.indexOf("SET order_status = 'refunded'");
    expect(reverseCall).toBeGreaterThan(0);
    expect(statusRefunded).toBeGreaterThan(reverseCall);
    expect(transition).toMatch(/gift_certificate_refund_order_atomic/);
    expect(transition).not.toMatch(/gift_certificate_redemption_reverse/);
  });

  it("T12: redemption reverse idempotent when no open rows", () => {
    expect(g2).toMatch(/reversed_count', 0, 'idempotent', true/);
  });

  it("T13/T14: converted refund uses cash debit + recovery obligation, no negative cash", () => {
    expect(g2).toMatch(/store_cash_accounts_balance_nonneg_chk/);
    expect(g2).toMatch(/GIFT_REDEMPTION_REVERSAL/);
    expect(g2).toMatch(/store_cash_recovery_obligations/);
    expect(g2).toMatch(/LEAST\(coalesce\(v_cash_balance/);
  });

  it("T15: gift_accept marks ACCEPTED after ownership move", () => {
    const acceptIdx = g2.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_accept");
    const body = g2.slice(acceptIdx, acceptIdx + 3500);
    const ownership = body.indexOf("current_owner_user_id = p_recipient_user_id");
    const accepted = body.lastIndexOf("status = 'ACCEPTED'");
    expect(ownership).toBeGreaterThan(0);
    expect(accepted).toBeGreaterThan(ownership);
  });

  it("T16: Store Cash non-negative CHECK present", () => {
    expect(g2).toMatch(/CONSTRAINT store_cash_accounts_balance_nonneg_chk CHECK \(balance >= 0\)/);
  });

  it("RPC names resolve in G2 or checkout migration", () => {
    for (const fn of Object.values(GIFT_RPCS)) {
      const found = g2.includes(`FUNCTION public.${fn}(`) || g7.includes(`FUNCTION public.${fn}(`);
      expect(found, fn).toBe(true);
    }
  });
});
