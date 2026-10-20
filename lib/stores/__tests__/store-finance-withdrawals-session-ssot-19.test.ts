/**
 * finance-ssot-19 — owner Coin withdrawal route uses validateActiveSession (same as finance route)
 * and maps coin_withdrawal_request 'not_owner' → 403.
 */
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validateActiveSession = vi.fn();
const getRouteUserId = vi.fn();
const getCachedStoreIfOwner = vi.fn();
const requestCoinWithdrawal = vi.fn();
const tryGetSupabaseForStores = vi.fn();

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: () => getRouteUserId() }));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: (...a: unknown[]) => validateActiveSession(...a),
}));
vi.mock("@/lib/stores/owner-store-ownership-cache", () => ({
  getCachedStoreIfOwner: (...a: unknown[]) => getCachedStoreIfOwner(...a),
}));
// POST uses the uncached operational-write gate (1-B); same ownership verdict as the cached gate here.
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwnerForOperationalWrite: (...a: unknown[]) => getCachedStoreIfOwner(...a),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => tryGetSupabaseForStores(),
}));
vi.mock("@/lib/currency/coin-withdrawal-writer", () => ({
  COIN_WITHDRAWAL_REQUESTS_TABLE: "coin_withdrawal_requests",
  requestCoinWithdrawal: (...a: unknown[]) => requestCoinWithdrawal(...a),
}));
vi.mock("@/lib/stores/advertising/canonical-business-cash-writer", () => ({
  loadStoreEconomicPointsBalance: vi.fn(async () => ({ balance: 10_000 })),
}));

const ctx = { params: Promise.resolve({ storeId: "store-1" }) };

function postReq(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const validBody = {
  amount: 500,
  idempotencyKey: "idem-1",
  destinationType: "gcash",
  destination_type: "gcash",
  accountNumber: "09171234567",
  account_number: "09171234567",
  accountName: "Juan",
  account_name: "Juan",
};

describe("/api/me/stores/[storeId]/finance/withdrawals", () => {
  beforeEach(() => {
    vi.resetModules();
    validateActiveSession.mockReset();
    getRouteUserId.mockReset();
    getCachedStoreIfOwner.mockReset();
    requestCoinWithdrawal.mockReset();
    tryGetSupabaseForStores.mockReset();
    getRouteUserId.mockResolvedValue("owner-1");
    tryGetSupabaseForStores.mockReturnValue({});
    getCachedStoreIfOwner.mockResolvedValue({ ok: true });
    validateActiveSession.mockResolvedValue({ ok: true, profile: {} });
  });

  it.each(["POST", "GET"] as const)("%s rejects inactive session via validateActiveSession", async (m) => {
    validateActiveSession.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "session_inactive" }, { status: 403 }),
    });
    const mod = await import("@/app/api/me/stores/[storeId]/finance/withdrawals/route");
    const res = m === "POST" ? await mod.POST(postReq(validBody), ctx) : await mod.GET(postReq({}), ctx);
    expect(res.status).toBe(403);
    expect(validateActiveSession).toHaveBeenCalledWith("owner-1");
    expect(getCachedStoreIfOwner).not.toHaveBeenCalled();
    expect(requestCoinWithdrawal).not.toHaveBeenCalled();
  });

  it("RPC not_owner → 403", async () => {
    requestCoinWithdrawal.mockResolvedValue({ ok: false, error: "not_owner" });
    const mod = await import("@/app/api/me/stores/[storeId]/finance/withdrawals/route");
    const res = await mod.POST(postReq(validBody), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "not_owner" });
  });

  it("other RPC errors stay 400", async () => {
    requestCoinWithdrawal.mockResolvedValue({ ok: false, error: "insufficient_balance" });
    const mod = await import("@/app/api/me/stores/[storeId]/finance/withdrawals/route");
    const res = await mod.POST(postReq(validBody), ctx);
    expect(res.status).toBe(400);
  });
});
