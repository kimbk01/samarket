import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUPPORT_REFERENCE_TYPES,
  assertSupportReferenceAuthority,
} from "@/lib/support/support-reference-authority";
import { SUPPORT_CATEGORY_REGISTRY } from "@/lib/support/support-category-registry";
import { resolveSupportReferenceAdminHref } from "@/lib/support/support-reference-admin-href";
import { COIN_REFUND_ECONOMIC_UNWIND_CONTRACT } from "@/lib/currency/currency-ssot-hard-lock";

vi.mock("@/lib/stores/owner-store-ownership-cache", () => ({
  getCachedStoreIfOwner: vi.fn(async (_sb: unknown, userId: string, storeId: string) => {
    if (userId === "owner-1" && storeId === "store-own") {
      return { ok: true as const, store: { id: storeId } };
    }
    return { ok: false as const, error: "not_owner" };
  }),
}));

const OWN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const MISSING_ID = "33333333-3333-4333-8333-333333333333";

function mockSb(row: { id: string; store_id: string } | null) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  return { from: vi.fn(() => chain) } as unknown as SupabaseClient;
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("F-06 Support ↔ Coin withdrawal request pointer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T9 — existing Support reference types preserved (+ one new)", () => {
    expect(SUPPORT_REFERENCE_TYPES).toContain("BUSINESS_CASH_CHARGE_REQUEST");
    expect(SUPPORT_REFERENCE_TYPES).toContain("PARTNER_MEMBERSHIP");
    expect(SUPPORT_REFERENCE_TYPES).toContain("COIN_WITHDRAWAL_REQUEST");
    expect(SUPPORT_REFERENCE_TYPES.filter((t) => t === "COIN_WITHDRAWAL_REQUEST")).toHaveLength(
      1
    );
    expect(SUPPORT_REFERENCE_TYPES).not.toContain("COIN_WITHDRAW");
    expect(SUPPORT_REFERENCE_TYPES).not.toContain("COIN_WITHDRAWAL");
    expect(SUPPORT_REFERENCE_TYPES).not.toContain("COIN_PAYOUT");
  });

  it("T1 — COIN_WITHDRAW path: own valid request PASS", async () => {
    const sb = mockSb({ id: OWN_ID, store_id: "store-own" });
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: "owner-1",
        audience: "OWNER",
        storeId: "store-own",
        referenceType: "COIN_WITHDRAWAL_REQUEST",
        referenceId: OWN_ID,
      })
    ).resolves.toEqual({ ok: true });
  });

  it("T2 — other-store request DENIED", async () => {
    const sb = mockSb({ id: OTHER_ID, store_id: "store-other" });
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: "owner-1",
        audience: "OWNER",
        storeId: "store-own",
        referenceType: "COIN_WITHDRAWAL_REQUEST",
        referenceId: OTHER_ID,
      })
    ).resolves.toEqual({ ok: false, error: "reference_forbidden" });
  });

  it("T3 — nonexistent request DENIED", async () => {
    const sb = mockSb(null);
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: "owner-1",
        audience: "OWNER",
        storeId: "store-own",
        referenceType: "COIN_WITHDRAWAL_REQUEST",
        referenceId: MISSING_ID,
      })
    ).resolves.toEqual({ ok: false, error: "reference_forbidden" });
  });

  it("T4 — malformed reference DENIED safely", async () => {
    const sb = mockSb(null);
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: "owner-1",
        audience: "OWNER",
        storeId: "store-own",
        referenceType: "COIN_WITHDRAWAL_REQUEST",
        referenceId: "not-a-uuid",
      })
    ).resolves.toEqual({ ok: false, error: "invalid_reference_id" });
  });

  it("T5 — wrong reference type DENIED", async () => {
    const sb = mockSb({ id: OWN_ID, store_id: "store-own" });
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: "owner-1",
        audience: "OWNER",
        storeId: "store-own",
        referenceType: "COIN_WITHDRAW",
        referenceId: OWN_ID,
      })
    ).resolves.toEqual({ ok: false, error: "reference_type_not_allowed" });
  });

  it("T6 — unrelated Support category matrix does not authorize withdrawal ref", () => {
    const cashCoin = SUPPORT_CATEGORY_REGISTRY.find((c) => c.id === "CASH_COIN");
    expect(cashCoin?.allowedReferenceTypes).toContain("COIN_WITHDRAWAL_REQUEST");
    const settlement = SUPPORT_CATEGORY_REGISTRY.find((c) => c.id === "SETTLEMENT");
    expect(settlement?.allowedReferenceTypes ?? []).not.toContain("COIN_WITHDRAWAL_REQUEST");
    const order = SUPPORT_CATEGORY_REGISTRY.find((c) => c.id === "ORDER_DELIVERY");
    expect(order?.allowedReferenceTypes ?? []).not.toContain("COIN_WITHDRAWAL_REQUEST");
  });

  it("T7 — Admin authorized resolution href carries exact canonical id", () => {
    const link = resolveSupportReferenceAdminHref("COIN_WITHDRAWAL_REQUEST", OWN_ID);
    expect(link?.mutationOwner).toBe("FINANCE");
    expect(link?.href).toBe(
      `/admin/finance?coinWithdrawalRequestId=${encodeURIComponent(OWN_ID)}#coin-withdrawals`
    );
    const panel = read("components/admin/finance/AdminCoinWithdrawalsPanel.tsx");
    expect(panel).toContain("coinWithdrawalRequestId");
    expect(panel).toContain("data-finance-withdrawal-row");
  });

  it("T8 — Owner CTA wires exact reference type + id", () => {
    const panel = read("components/business/owner/OwnerCoinWithdrawalPanel.tsx");
    expect(panel).toContain('referenceType: "COIN_WITHDRAWAL_REQUEST"');
    expect(panel).toContain("referenceId: withdrawalRequestId");
    expect(panel).toContain('category: "CASH_COIN"');
    expect(panel).toContain("navigateToSupportCenter");
    expect(panel).toContain("data-owner-coin-withdrawal-support");
    expect(panel).toContain("data-coin-withdrawal-request-id");
  });

  it("privacy — Support stores pointer only; no finance field duplication", () => {
    const auth = read("lib/support/support-reference-authority.ts");
    expect(auth).toContain("COIN_WITHDRAWAL_REQUESTS_TABLE");
    expect(auth).toMatch(/select\("id, store_id"\)/);
    expect(auth).not.toMatch(/account_number|bank_name|payout/);
    const svc = read("lib/support/support-case-service.ts");
    expect(svc).not.toContain("coin_withdrawal_requests");
    expect(svc).not.toMatch(/bank_name|account_number/);
  });

  it("F-05 contract preserved", () => {
    expect(COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.postWithdrawalRefund).toBe("COIN_REVERSAL");
    expect(COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.cashClawback).toBe(false);
  });

  it("F-07 point write lock preserved", () => {
    const mig = read(
      "supabase/migrations/20270118150000_finance_f07_point_projection_write_lock.sql"
    );
    expect(mig).toMatch(/profiles[\s\S]*points/i);
  });
});
