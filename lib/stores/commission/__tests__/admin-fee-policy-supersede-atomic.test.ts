import { describe, expect, it, vi } from "vitest";
import { supersedeFeePolicyAtomic } from "@/lib/stores/commission/admin-fee-policy-guards";

function sbWith(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { sb: { rpc } as never, rpc };
}

describe("supersedeFeePolicyAtomic (D-1 · DEF-3)", () => {
  it("calls the single RPC with CAS value and returns the new id", async () => {
    const { sb, rpc } = sbWith({ data: { ok: true, id: "new-1", superseded_prev_ends_at: null } });
    const res = await supersedeFeePolicyAtomic(sb, {
      supersedeId: "old-1",
      newPolicy: { policy_name: "x", starts_at: "2026-11-01T00:00:00.000Z" },
      expectedUpdatedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledWith("admin_supersede_store_fee_policy", {
      p_supersede_id: "old-1",
      p_new: { policy_name: "x", starts_at: "2026-11-01T00:00:00.000Z" },
      p_expected_updated_at: "2026-10-01T00:00:00.000Z",
    });
    expect(res).toEqual({ ok: true, id: "new-1", supersededPrevEndsAt: null });
  });

  it("missing RPC → rpc_missing 503 (no non-atomic fallback)", async () => {
    const { sb } = sbWith({ error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await supersedeFeePolicyAtomic(sb, { supersedeId: "a", newPolicy: {} })).toEqual({
      ok: false,
      error: "rpc_missing",
      status: 503,
    });
  });

  it.each([
    ["stale_policy", 409],
    ["policy_archived", 409],
    ["supersede_policy_not_found", 404],
    ["supersede_window_invalid", 400],
    ["weird", 500],
  ])("RPC error %s → HTTP %i", async (code, status) => {
    const { sb } = sbWith({ data: { ok: false, error: code } });
    expect(await supersedeFeePolicyAtomic(sb, { supersedeId: "a", newPolicy: {} })).toEqual({
      ok: false,
      error: code,
      status,
    });
  });
});
