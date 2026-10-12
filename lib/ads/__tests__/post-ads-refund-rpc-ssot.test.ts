/**
 * finance-ssot-19 T1 — post_ads cancel/reject refund via DB RPC `refund_post_ad_points`.
 * - user cancel / admin reject → RPC (lock + ledger-based refund + status in one TX)
 * - admin approve/cancel/expire/confirm_payment → status-conditioned UPDATE, 0 rows → not_allowed
 * - routes no longer call creditUserPoints / refundPoints callbacks
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_POST_AD_TRANSITION_FROM,
  adminPatchPostAdInDb,
  cancelPostAdForUserWithServiceRole,
  httpStatusForRefundPostAdPointsError,
} from "@/lib/ads/post-ads-supabase";

type Call = { table: string; op: string; args: unknown[] };

function makeSb(opts: {
  row?: Record<string, unknown> | null;
  rpcResult?: Record<string, unknown> | null;
  rpcError?: { message: string } | null;
  updateRows?: Record<string, unknown>[];
}) {
  const calls: Call[] = [];
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    data: opts.rpcResult ?? null,
    error: opts.rpcError ?? null,
  }));

  function tableApi(table: string) {
    let op = "select";
    const api: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        calls.push({ table, op: op === "update" ? "update.select" : "select", args });
        return api;
      },
      update: (...args: unknown[]) => {
        op = "update";
        calls.push({ table, op: "update", args });
        return api;
      },
      insert: (...args: unknown[]) => {
        calls.push({ table, op: "insert", args });
        return Promise.resolve({ error: null });
      },
      eq: (...args: unknown[]) => {
        calls.push({ table, op: "eq", args });
        return api;
      },
      in: (...args: unknown[]) => {
        calls.push({ table, op: "in", args });
        return api;
      },
      maybeSingle: async () => {
        if (table === "post_ads") return { data: opts.row ?? null, error: null };
        if (table === "ad_products") return { data: { duration_days: 3 }, error: null };
        return { data: null, error: null };
      },
      then: (resolveFn: (v: unknown) => unknown) => {
        // awaited update(...).eq().in().select()
        if (op === "update") {
          return Promise.resolve({ data: opts.updateRows ?? [], error: null }).then(resolveFn);
        }
        return Promise.resolve({ data: [], error: null }).then(resolveFn);
      },
    };
    return api;
  }

  const sb = { rpc, from: vi.fn((t: string) => tableApi(t)) } as unknown as SupabaseClient;
  return { sb, rpc, calls };
}

const USER = "11111111-1111-4111-8111-111111111111";
const AD = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";

describe("cancelPostAdForUserWithServiceRole → refund_post_ad_points", () => {
  it("calls RPC with (user, ad, 'user', user, 'cancelled', null)", async () => {
    const { sb, rpc } = makeSb({
      rpcResult: { ok: true, idempotent: false, refunded_amount: 500, ledger_id: "l1", status: "cancelled" },
    });
    const r = await cancelPostAdForUserWithServiceRole(sb, USER, AD);
    expect(rpc).toHaveBeenCalledWith("refund_post_ad_points", {
      p_user_id: USER,
      p_ad_id: AD,
      p_actor_type: "user",
      p_actor_id: USER,
      p_target_status: "cancelled",
      p_reason: null,
    });
    expect(r).toEqual({ ok: true, idempotent: false, refundedAmount: 500 });
  });

  it("does not read/update post_ads directly (no TS read→refund→update race)", async () => {
    const { sb, calls } = makeSb({
      rpcResult: { ok: true, idempotent: true, refunded_amount: 0, ledger_id: null, status: "cancelled" },
    });
    await cancelPostAdForUserWithServiceRole(sb, USER, AD);
    expect(calls.filter((c) => c.table === "post_ads")).toHaveLength(0);
  });

  it.each([
    ["not_found", 404],
    ["not_owner", 403],
    ["not_cancellable", 409],
    ["forbidden", 500],
    ["invalid_input", 400],
  ])("propagates RPC error %s (HTTP %d)", async (code, status) => {
    const { sb } = makeSb({ rpcResult: { ok: false, error: code, current_status: "active" } });
    const r = await cancelPostAdForUserWithServiceRole(sb, USER, AD);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(code);
    expect(httpStatusForRefundPostAdPointsError(code)).toBe(status);
  });

  it("RPC transport error → not ok (never silent success)", async () => {
    const { sb } = makeSb({ rpcError: { message: "boom" } });
    const r = await cancelPostAdForUserWithServiceRole(sb, USER, AD);
    expect(r.ok).toBe(false);
  });
});

describe("adminPatchPostAdInDb", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reject → refund_post_ad_points(ad.user_id, ad, 'admin', adminId, 'rejected', note)", async () => {
    const { sb, rpc, calls } = makeSb({
      row: { id: AD, user_id: USER, apply_status: "pending_review", payment_method: "points" },
      rpcResult: { ok: true, idempotent: false, refunded_amount: 300, ledger_id: "l2", status: "rejected" },
    });
    const r = await adminPatchPostAdInDb(sb, AD, ADMIN, "reject", "bad content");
    expect(r).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("refund_post_ad_points", {
      p_user_id: USER,
      p_ad_id: AD,
      p_actor_type: "admin",
      p_actor_id: ADMIN,
      p_target_status: "rejected",
      p_reason: "bad content",
    });
    expect(calls.some((c) => c.table === "post_ads" && c.op === "update")).toBe(false);
  });

  it("reject not_cancellable → 409 error, not success", async () => {
    const { sb } = makeSb({
      row: { id: AD, user_id: USER, apply_status: "active" },
      rpcResult: { ok: false, error: "not_cancellable", current_status: "active" },
    });
    const r = await adminPatchPostAdInDb(sb, AD, ADMIN, "reject");
    expect(r).toMatchObject({ ok: false, error: "not_cancellable", httpStatus: 409 });
  });

  it("approve includes status precondition .in('apply_status', [pending_payment, pending_review])", async () => {
    const { sb, calls } = makeSb({
      row: { id: AD, user_id: USER, apply_status: "pending_review", ad_product_id: "p1" },
      updateRows: [{ id: AD }],
    });
    const r = await adminPatchPostAdInDb(sb, AD, ADMIN, "approve");
    expect(r).toEqual({ ok: true });
    const inCall = calls.find((c) => c.table === "post_ads" && c.op === "in");
    expect(inCall?.args).toEqual(["apply_status", ["pending_payment", "pending_review"]]);
    expect(calls.some((c) => c.op === "update.select")).toBe(true);
  });

  it("approve with 0 updated rows (concurrent change) → not_allowed", async () => {
    const { sb } = makeSb({
      row: { id: AD, user_id: USER, apply_status: "pending_review" },
      updateRows: [],
    });
    const r = await adminPatchPostAdInDb(sb, AD, ADMIN, "approve");
    expect(r).toMatchObject({ ok: false, error: "not_allowed", httpStatus: 409 });
  });

  it.each(["cancel", "expire"] as const)("%s uses status precondition and detects 0 rows", async (action) => {
    const { sb, calls } = makeSb({ row: { id: AD, user_id: USER, apply_status: "rejected" }, updateRows: [] });
    const r = await adminPatchPostAdInDb(sb, AD, ADMIN, action);
    expect(r).toMatchObject({ ok: false, error: "not_allowed" });
    const inCall = calls.find((c) => c.table === "post_ads" && c.op === "in");
    expect(inCall?.args).toEqual(["apply_status", [...ADMIN_POST_AD_TRANSITION_FROM[action]]]);
  });

  it("transition tables match product rules", () => {
    expect(ADMIN_POST_AD_TRANSITION_FROM.approve).toEqual(["pending_payment", "pending_review"]);
    expect(ADMIN_POST_AD_TRANSITION_FROM.expire).toEqual(["active", "approved"]);
    expect(ADMIN_POST_AD_TRANSITION_FROM.cancel).not.toContain("rejected");
    expect(ADMIN_POST_AD_TRANSITION_FROM.cancel).not.toContain("expired");
    expect(ADMIN_POST_AD_TRANSITION_FROM.cancel).not.toContain("cancelled");
  });
});

describe("static contract — routes no longer refund in TS", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  const routes = [
    "app/api/me/post-ads/[adId]/cancel/route.ts",
    "app/api/admin/ads/[adId]/route.ts",
    "app/api/admin/ad-applications/[id]/route.ts",
  ];

  it.each(routes)("%s has no creditUserPoints / refundPoints", (p) => {
    const src = read(p);
    expect(src).not.toContain("creditUserPoints");
    expect(src).not.toContain("refundPoints");
  });

  it("post-ads-supabase uses refund_post_ad_points and does not invoke refund callbacks", () => {
    const src = read("lib/ads/post-ads-supabase.ts");
    expect(src).toContain('rpc("refund_post_ad_points"');
    expect(src).not.toMatch(/options\?\.refundPoints|options\.refundPoints\(/);
  });

  it("admin generic update cannot set apply_status from body.status", () => {
    const src = read("app/api/admin/ads/[adId]/route.ts");
    expect(src).not.toContain("payload.apply_status");
    expect(src).toContain("status_change_requires_action");
  });
});

/* ── route behaviour: cancel route maps RPC errors ─────────────────────────── */
const requireAuthenticatedUserId = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: () => requireAuthenticatedUserId(),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient(),
}));

describe("POST /api/me/post-ads/[adId]/cancel", () => {
  beforeEach(() => {
    requireAuthenticatedUserId.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
    requireAuthenticatedUserId.mockResolvedValue({ ok: true, userId: USER });
  });

  it.each([
    ["not_found", 404],
    ["not_owner", 403],
    ["not_cancellable", 409],
    ["forbidden", 500],
    ["invalid_input", 400],
  ])("RPC %s → HTTP %d", async (code, status) => {
    const { sb, rpc } = makeSb({ rpcResult: { ok: false, error: code } });
    tryCreateSupabaseServiceClient.mockReturnValue(sb);
    const { POST } = await import("@/app/api/me/post-ads/[adId]/cancel/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ adId: AD }) });
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ ok: false, error: code });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_actor_type: "user", p_target_status: "cancelled" });
  });

  it("success returns refunded_amount", async () => {
    const { sb } = makeSb({
      rpcResult: { ok: true, idempotent: false, refunded_amount: 700, ledger_id: "l", status: "cancelled" },
    });
    tryCreateSupabaseServiceClient.mockReturnValue(sb);
    const { POST } = await import("@/app/api/me/post-ads/[adId]/cancel/route");
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ adId: AD }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, refunded_amount: 700 });
  });
});
