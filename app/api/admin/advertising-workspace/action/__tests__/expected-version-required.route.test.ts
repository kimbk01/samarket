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
    // R2: 배달 일시중지는 사유 필수(writer 와 동일) — 사유를 넣고 버전 검사만 본다.
    const res = await call({ family: "delivery_banner", entityId: "camp-1", action: "pause", reason: "점검", ...versions });
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
      reason: "점검",
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
    const res = await call({
      family: "delivery_banner",
      entityId: "camp-1",
      action: "delete_safe_draft",
      reason: "중복 초안 정리",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("expected_version_required");
    expect(adminDeleteSafeDraftDeliveryAdCampaign).not.toHaveBeenCalled();
  });
});

describe("advertising-workspace action — R2 처리 사유", () => {
  it.each(["approve", "reject", "end", "terminate", "delete_safe_draft"])(
    "rejects %s without a reason (reason_required) before any write",
    async (action) => {
      const res = await call({
        family: "delivery_banner",
        entityId: "camp-1",
        action,
        expectedUpdatedAt: "2026-10-01T00:00:00Z",
        expectedLifecycle: "draft",
        reason: " ",
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("reason_required");
      expect(adminTransitionDeliveryAdCampaign).not.toHaveBeenCalled();
      expect(adminDeleteSafeDraftDeliveryAdCampaign).not.toHaveBeenCalled();
    }
  );

  it("passes the reason to the delivery writer (audit reason)", async () => {
    const res = await call({
      family: "delivery_banner",
      entityId: "camp-1",
      action: "approve",
      expectedUpdatedAt: "2026-10-01T00:00:00Z",
      expectedLifecycle: "pending_review",
      reason: "소재 확인 완료",
    });
    expect(res.status).toBe(200);
    expect(adminTransitionDeliveryAdCampaign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "approve", reason: "소재 확인 완료" })
    );
  });

  it("delete_safe_draft passes the reason to the delete writer", async () => {
    adminDeleteSafeDraftDeliveryAdCampaign.mockResolvedValue({ ok: true });
    const res = await call({
      family: "delivery_banner",
      entityId: "camp-1",
      action: "delete_safe_draft",
      expectedUpdatedAt: "2026-10-01T00:00:00Z",
      expectedLifecycle: "draft",
      reason: "중복 초안 정리",
    });
    expect(res.status).toBe(200);
    expect(adminDeleteSafeDraftDeliveryAdCampaign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "중복 초안 정리" })
    );
  });
});
