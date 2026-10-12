import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const requireAdminApiUser = vi.fn();
const requireAdminPermission = vi.fn();
const adminRefundOrphanDeliveryAdFunding = vi.fn();
const adminTransitionDeliveryAdCampaign = vi.fn();
const adminDeleteSafeDraftDeliveryAdCampaign = vi.fn();

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: (...a: unknown[]) => requireAdminApiUser(...a),
}));
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-writer", () => ({
  adminRefundOrphanDeliveryAdFunding: (...a: unknown[]) => adminRefundOrphanDeliveryAdFunding(...a),
  adminTransitionDeliveryAdCampaign: (...a: unknown[]) => adminTransitionDeliveryAdCampaign(...a),
  adminDeleteSafeDraftDeliveryAdCampaign: (...a: unknown[]) => adminDeleteSafeDraftDeliveryAdCampaign(...a),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({ from: vi.fn(), rpc: vi.fn() }),
}));

import { POST } from "@/app/api/admin/delivery-ads/[campaignId]/actions/route";

function call(body: Record<string, unknown>) {
  return POST(
    new Request("https://x.test/api/admin/delivery-ads/camp-1/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ campaignId: "camp-1" }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
  requireAdminPermission.mockResolvedValue({ ok: true, actor: { userId: "admin-1" }, sb: {} });
});

describe("admin delivery-ad refund_orphan_funding action", () => {
  it("requires business permission", async () => {
    requireAdminPermission.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden_permission" }, { status: 403 }),
    });
    const res = await call({ action: "refund_orphan_funding", productKind: "banner", reason: "x" });
    expect(res.status).toBe(403);
    expect(requireAdminPermission).toHaveBeenCalledWith("business");
    expect(adminRefundOrphanDeliveryAdFunding).not.toHaveBeenCalled();
  });

  it("requires reason (400) without calling the writer", async () => {
    const res = await call({ action: "refund_orphan_funding", productKind: "banner", reason: "  " });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("reason_required");
    expect(adminRefundOrphanDeliveryAdFunding).not.toHaveBeenCalled();
  });

  it("calls the writer with the permission actor and returns ok", async () => {
    adminRefundOrphanDeliveryAdFunding.mockResolvedValue({ ok: true, idempotent: false, refundedMinor: 500 });
    const res = await call({ action: "refund_orphan_funding", productKind: "store_sponsored", reason: "orphan" });
    expect(res.status).toBe(200);
    expect(adminRefundOrphanDeliveryAdFunding).toHaveBeenCalledWith(expect.anything(), {
      adminUserId: "admin-1",
      productKind: "store_sponsored",
      campaignId: "camp-1",
      reason: "orphan",
    });
    // Not routed into the lifecycle transition / delete paths.
    expect(adminTransitionDeliveryAdCampaign).not.toHaveBeenCalled();
    expect(adminDeleteSafeDraftDeliveryAdCampaign).not.toHaveBeenCalled();
  });

  it.each([
    ["not_orphan", 409],
    ["not_secured", 409],
    ["reason_required", 400],
    ["not_found", 404],
    ["forbidden", 403],
  ])("maps %s → %d", async (error, status) => {
    adminRefundOrphanDeliveryAdFunding.mockResolvedValue({ ok: false, error });
    const res = await call({ action: "refund_orphan_funding", productKind: "banner", reason: "r" });
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: string }).error).toBe(error);
  });

  it("invalid product rejected before permission/refund", async () => {
    const res = await call({ action: "refund_orphan_funding", productKind: "partner", reason: "r" });
    expect(res.status).toBe(400);
    expect(adminRefundOrphanDeliveryAdFunding).not.toHaveBeenCalled();
  });
});
