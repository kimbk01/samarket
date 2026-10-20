import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiUser = vi.fn();
const adminTransitionDeliveryAdCampaign = vi.fn();
const adminDeleteSafeDraftDeliveryAdCampaign = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: (...a: unknown[]) => requireAdminApiUser(...a),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-writer", () => ({
  adminTransitionDeliveryAdCampaign: (...a: unknown[]) => adminTransitionDeliveryAdCampaign(...a),
  adminDeleteSafeDraftDeliveryAdCampaign: (...a: unknown[]) => adminDeleteSafeDraftDeliveryAdCampaign(...a),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => maybeSingle(),
      };
      return q;
    },
  }),
}));

import { POST } from "@/app/api/admin/advertising-workspace/action/route";

function call(body: Record<string, unknown>) {
  return POST(
    new Request("https://x.test/api/admin/advertising-workspace/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
  maybeSingle.mockResolvedValue({ data: { id: "camp-1" }, error: null });
  adminTransitionDeliveryAdCampaign.mockResolvedValue({ ok: true });
});

describe("advertising-workspace action — DEF-6 expected version required", () => {
  it.each([
    [{}],
    [{ expectedUpdatedAt: "2026-10-01T00:00:00Z" }],
    [{ expectedLifecycle: "live" }],
    [{ expectedUpdatedAt: "  ", expectedLifecycle: "live" }],
  ])("rejects delivery state changes without both versions (%j)", async (versions) => {
    const res = await call({ family: "delivery_banner", entityId: "camp-1", action: "pause", ...versions });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("expected_version_required");
    expect(maybeSingle).not.toHaveBeenCalled();
    expect(adminTransitionDeliveryAdCampaign).not.toHaveBeenCalled();
  });

  it("does not fill the expected version from the DB row", async () => {
    const res = await call({
      family: "delivery_sponsored",
      entityId: "camp-1",
      action: "pause",
      expectedUpdatedAt: "2026-10-01T00:00:00Z",
      expectedLifecycle: "live",
    });
    expect(res.status).toBe(200);
    expect(adminTransitionDeliveryAdCampaign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        productKind: "store_sponsored",
        action: "pause",
        expectedUpdatedAt: "2026-10-01T00:00:00Z",
        expectedLifecycle: "live",
      })
    );
  });

  it("requires the versions for delete_safe_draft too", async () => {
    const res = await call({ family: "delivery_banner", entityId: "camp-1", action: "delete_safe_draft" });
    expect(res.status).toBe(400);
    expect(adminDeleteSafeDraftDeliveryAdCampaign).not.toHaveBeenCalled();
  });
});
