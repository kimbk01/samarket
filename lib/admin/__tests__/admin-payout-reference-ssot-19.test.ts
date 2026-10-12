/**
 * finance-ssot-19 — admin payout routes:
 * - PATCH /api/admin/store-settlements/[id]: business permission gate, paid requires
 *   payout_reference + payout_method, DB trigger settlement_paid_blocked_coin_recognized → 409.
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

function settlementsSb(updateResult: { data: unknown; error: unknown }) {
  const updates: Record<string, unknown>[] = [];
  const sb = {
    from: vi.fn(() => {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: () => api,
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return api;
        },
        maybeSingle: async () =>
          updates.length > 0
            ? updateResult
            : { data: { settlement_status: "scheduled", order_id: "o1", store_id: "s1" }, error: null },
      };
      return api;
    }),
  };
  return { sb, updates };
}

function patchReq(body: unknown) {
  return new Request("http://x/api/admin/store-settlements/st1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const ctx = { params: Promise.resolve({ settlementId: "st1" }) };

describe("PATCH /api/admin/store-settlements/[settlementId]", () => {
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
    const res = await PATCH(patchReq({ settlement_status: "paid" }), ctx);
    expect(res.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("business");
    expect(tryGetSupabaseForStores).not.toHaveBeenCalled();
  });

  it.each([
    [{ settlement_status: "paid" }],
    [{ settlement_status: "paid", payout_method: "gcash" }],
    [{ settlement_status: "paid", payout_reference: "REF-1" }],
    [{ settlement_status: "paid", payout_method: "  ", payout_reference: "REF-1" }],
    [{ settlement_status: "paid", payout_method: "bank", payout_reference: "   " }],
  ])("paid without reference+method → 400 payout_reference_required (%j)", async (body) => {
    const { sb, updates } = settlementsSb({ data: { id: "st1" }, error: null });
    tryGetSupabaseForStores.mockReturnValue(sb);
    const { PATCH } = await import("@/app/api/admin/store-settlements/[settlementId]/route");
    const res = await PATCH(patchReq(body), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "payout_reference_required" });
    expect(updates).toHaveLength(0);
  });

  it("DB trigger settlement_paid_blocked_coin_recognized → 409 settlement_coin_recognized", async () => {
    const { sb } = settlementsSb({
      data: null,
      error: { code: "P0001", message: "settlement_paid_blocked_coin_recognized: order o1" },
    });
    tryGetSupabaseForStores.mockReturnValue(sb);
    const { PATCH } = await import("@/app/api/admin/store-settlements/[settlementId]/route");
    const res = await PATCH(
      patchReq({ settlement_status: "paid", payout_method: "gcash", payout_reference: "REF-1" }),
      ctx
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "settlement_coin_recognized" });
  });

  it("paid with reference+method persists trimmed values", async () => {
    const { sb, updates } = settlementsSb({ data: { id: "st1" }, error: null });
    tryGetSupabaseForStores.mockReturnValue(sb);
    const { PATCH } = await import("@/app/api/admin/store-settlements/[settlementId]/route");
    const res = await PATCH(
      patchReq({ settlement_status: "paid", payout_method: " gcash ", payout_reference: " REF-9 " }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({
      settlement_status: "paid",
      payout_method: "gcash",
      payout_reference: "REF-9",
    });
  });

  it("held still works without payout reference", async () => {
    const { sb } = settlementsSb({ data: { id: "st1" }, error: null });
    tryGetSupabaseForStores.mockReturnValue(sb);
    const { PATCH } = await import("@/app/api/admin/store-settlements/[settlementId]/route");
    const res = await PATCH(patchReq({ settlement_status: "held", hold_reason: "check" }), ctx);
    expect(res.status).toBe(200);
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

  it("passes trimmed method/reference to RPC writer", async () => {
    markCoinWithdrawalPaid.mockResolvedValue({ ok: true });
    const { POST } = await import("@/app/api/admin/coin-withdrawals/route");
    const res = await POST(
      postReq({ action: "mark_paid", requestId: "w1", payoutMethod: " gcash ", payoutReference: " R1 " })
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
      postReq({ action: "mark_paid", requestId: "w1", payoutMethod: "bank", payoutReference: "R1" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "payout_reference_required" });
  });
});

describe("admin UIs require payout reference before submit (static)", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("AdminStoreSettlementsPage blocks paid submit without method+reference and maps 409", () => {
    const src = read("components/admin/stores/AdminStoreSettlementsPage.tsx");
    expect(src).toContain('settlementErrMessage("payout_reference_required")');
    expect(src).toContain('case "settlement_coin_recognized"');
  });

  it("AdminOpsConsolePage sends payout_method + payout_reference on paid", () => {
    const src = read("components/admin/ops-console/AdminOpsConsolePage.tsx");
    expect(src).toContain("payout_reference: safeTrim(modal.payoutReference)");
    expect(src).toContain("payout_method: safeTrim(modal.payoutMethod)");
  });

  it("AdminCoinWithdrawalsPanel collects reference in confirm step", () => {
    const src = read("components/admin/finance/AdminCoinWithdrawalsPanel.tsx");
    expect(src).toContain('reasonRequired={pending?.action === "mark_paid"}');
    expect(src).toContain("payoutReference: payout.reference.trim()");
  });

  it("point-charges route maps snapshot_invalid → 400", () => {
    const src = read("app/api/admin/point-charges/[id]/route.ts");
    expect(src).toMatch(/errCode === "snapshot_invalid"[\s\S]{0,500}status: 400/);
  });
});
