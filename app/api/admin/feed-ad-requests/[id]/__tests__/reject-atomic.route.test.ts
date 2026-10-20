import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiUser = vi.fn();
const appendAdminRouteAudit = vi.fn();
const rpc = vi.fn();
const from = vi.fn();
const approveFeedAdRequest = vi.fn();

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: (...a: unknown[]) => requireAdminApiUser(...a),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => appendAdminRouteAudit(...a),
}));
vi.mock("@/lib/ads/approve-feed-ad-request", () => ({
  approveFeedAdRequest: (...a: unknown[]) => approveFeedAdRequest(...a),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ rpc, from }),
}));

import { PATCH } from "@/app/api/admin/feed-ad-requests/[id]/route";

function call(body: Record<string, unknown>) {
  return PATCH(
    new Request("https://x.test/api/admin/feed-ad-requests/req-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id: "req-1" }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
});

describe("V3-02 admin feed-ad reject — single RPC transaction", () => {
  it("400 reason_required without calling the RPC", async () => {
    const res = await call({ action: "reject", reason: "  " });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls admin_reject_feed_ad_request only (no table writes) and audits", async () => {
    rpc.mockResolvedValue({
      data: { ok: true, status: "rejected", previous_status: "pending_review", released_points: 300 },
      error: null,
    });
    const res = await call({ action: "reject", reason: "부적절한 이미지" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "rejected" });
    expect(rpc).toHaveBeenCalledWith("admin_reject_feed_ad_request", {
      p_request_id: "req-1",
      p_reason: "부적절한 이미지",
      p_actor: "admin-1",
    });
    expect(from).not.toHaveBeenCalled();
    expect(appendAdminRouteAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        action: "feed_ad_request.reject",
        targetType: "feed_ad_request",
        targetId: "req-1",
        actorId: "admin-1",
      })
    );
  });

  it.each([
    ["not_pending", 409],
    ["not_found", 404],
    ["reason_required", 400],
    ["forbidden", 500],
  ])("maps RPC error %s → %i without audit", async (error, status) => {
    rpc.mockResolvedValue({ data: { ok: false, error }, error: null });
    const res = await call({ action: "reject", reason: "x" });
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: string }).error).toBe(error);
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });

  it("500 on transport error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await call({ action: "reject", reason: "x" });
    expect(res.status).toBe(500);
    expect(appendAdminRouteAudit).not.toHaveBeenCalled();
  });

  it("approve success appends feed_ad_request.approve audit", async () => {
    approveFeedAdRequest.mockResolvedValue({ ok: true, status: "approved", campaignId: "c-1" });
    const res = await call({ action: "approve" });
    expect(res.status).toBe(200);
    expect(appendAdminRouteAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ action: "feed_ad_request.approve", targetId: "req-1" })
    );
  });
});
