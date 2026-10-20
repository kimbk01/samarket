/**
 * finance-ssot-19 — admin payout routes:
 * - PATCH /api/admin/store-settlements/[id]: business permission gate, then 410 — per-order payout
 *   is retired (buyers pay stores directly; docs/store-commission-cash-settlement-ssot.md).
 * - POST /api/admin/coin-withdrawals mark_paid: payout reference required, RPC error mapped.
 * - point-charges approve: snapshot_invalid → 400.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminPermission = vi.fn();
const tryGetSupabaseForStores = vi.fn();
const markCoinWithdrawalPaid = vi.fn();
const rejectCoinWithdrawal = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...args: unknown[]) => requireAdminPermission(...args),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => tryGetSupabaseForStores(),
}));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "admin-1" }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit/request-meta", () => ({
  getAuditRequestMeta: () => ({ ip: null, userAgent: null }),
}));
vi.mock("@/lib/currency/coin-withdrawal-writer", () => ({
  COIN_WITHDRAWAL_REQUESTS_TABLE: "coin_withdrawal_requests",
  markCoinWithdrawalPaid: (...args: unknown[]) => markCoinWithdrawalPaid(...args),
  rejectCoinWithdrawal: (...args: unknown[]) => rejectCoinWithdrawal(...args),
}));

describe("PATCH /api/admin/store-settlements/[settlementId] (retired — direct-pay model)", () => {
  beforeEach(() => {
    requireAdminPermission.mockReset();
    tryGetSupabaseForStores.mockReset();
    requireAdminPermission.mockResolvedValue({ ok: true, sb: {}, actor: { userId: "admin-1" } });
  });

  it("uses requireAdminPermission('business') and returns its response when denied", async () => {
    requireAdminPermission.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "permission_denied" }, { status: 403 }),
    });
    const { PATCH } = await import("@/app/api/admin/store-settlements/[settlementId]/route");
    const res = await PATCH();
    expect(res.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("business");
  });

  it("per-order payout is retired → 410 and never touches the DB", async () => {
    const { PATCH } = await import("@/app/api/admin/store-settlements/[settlementId]/route");
    const res = await PATCH();
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ ok: false, error: "settlement_payout_retired" });
    expect(tryGetSupabaseForStores).not.toHaveBeenCalled();
  });

  it("route no longer uses isRouteAdmin", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/admin/store-settlements/[settlementId]/route.ts"),
      "utf8"
    );
    expect(src).not.toContain("isRouteAdmin");
    expect(src).toContain('requireAdminPermission("business")');
  });
});

function postReq(body: unknown) {
  return new Request("http://x/api/admin/coin-withdrawals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/admin/coin-withdrawals mark_paid", () => {
  beforeEach(() => {
    requireAdminPermission.mockReset();
    markCoinWithdrawalPaid.mockReset();
    requireAdminPermission.mockResolvedValue({ ok: true, sb: {}, actor: { userId: "admin-1" } });
  });

  it.each([
    [{}],
    [{ payoutMethod: "gcash" }],
    [{ payoutMethod: "gcash", payoutReference: "   " }],
    [{ payoutReference: "REF" }],
  ])("missing reference/method → 400 payout_reference_required (%j)", async (extra) => {
    const { POST } = await import("@/app/api/admin/coin-withdrawals/route");
    const res = await POST(postReq({ action: "mark_paid", requestId: "w1", ...extra }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "payout_reference_required" });
    expect(markCoinWithdrawalPaid).not.toHaveBeenCalled();
  });

  it("R2 — missing reason (L2 payout) → 400 reason_required, writer not called", async () => {
    const { POST } = await import("@/app/api/admin/coin-withdrawals/route");
    const res = await POST(postReq({ action: "mark_paid", requestId: "w1", payoutMethod: "gcash", payoutReference: "R1" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "reason_required" });
    expect(markCoinWithdrawalPaid).not.toHaveBeenCalled();
  });

  it("passes trimmed method/reference to RPC writer", async () => {
    markCoinWithdrawalPaid.mockResolvedValue({ ok: true });
    const { POST } = await import("@/app/api/admin/coin-withdrawals/route");
    const res = await POST(
      postReq({ action: "mark_paid", requestId: "w1", payoutMethod: " gcash ", payoutReference: " R1 ", reason: "지급 확인" })
    );
    expect(res.status).toBe(200);
    expect(markCoinWithdrawalPaid).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ requestId: "w1", payoutMethod: "gcash", payoutReference: "R1" })
    );
  });

  it("RPC payout_reference_required is surfaced as 400", async () => {
    markCoinWithdrawalPaid.mockResolvedValue({ ok: false, error: "payout_reference_required" });
    const { POST } = await import("@/app/api/admin/coin-withdrawals/route");
    const res = await POST(
      postReq({ action: "mark_paid", requestId: "w1", payoutMethod: "bank", payoutReference: "R1", reason: "지급 확인" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "payout_reference_required" });
  });
});

describe("admin UIs require payout reference before submit (static)", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("store settlement UIs have no per-order payout CTA (commission review only)", () => {
    const ledger = read("components/admin/stores/AdminStoreCommissionLedgerPage.tsx");
    expect(ledger).toContain("/api/admin/store-commission-ledger/adjustments");
    expect(ledger).not.toContain("payout_reference");
    const ops = read("components/admin/ops-console/AdminOpsConsolePage.tsx");
    expect(ops).not.toContain("/api/admin/store-settlements/");
    expect(ops).not.toContain('settlement_status: "paid"');
  });

  it("AdminCoinWithdrawalsPanel collects reference in confirm step", () => {
    const src = read("components/admin/finance/AdminCoinWithdrawalsPanel.tsx");
    expect(src).toContain('data-finance-payout-reference-input="mark_paid"');
    expect(src).toContain("payoutReference: payout.reference.trim()");
  });

  it("point-charges route maps snapshot_invalid → 400", () => {
    // 본문은 공용 처리로 이동 (라우트는 권한 키 `point` 확인 후 위임)
    const src = read("lib/admin/shared-handlers/admin-point-charge-item.ts");
    expect(src).toMatch(/errCode === "snapshot_invalid"[\s\S]{0,500}status: 400/);
  });
});
