import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit/append-audit-log", () => ({
  appendAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { adminDeletePlatformPopupDraftCampaign } from "@/lib/platform-popup/admin-campaign-delete-draft";

function mockSb(row: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eqSelect = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: eqSelect });
  const eqDelete = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockReturnValue({ eq: eqDelete });
  return {
    from: vi.fn((table: string) => {
      if (table === "platform_popup_campaigns") {
        return { select, delete: del };
      }
      return {};
    }),
    _del: del,
  };
}

describe("adminDeletePlatformPopupDraftCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes Admin Direct draft", async () => {
    const sb = mockSb({
      id: "c1",
      status: "draft",
      approval_status: "not_submitted",
      owner_store_id: null,
      owner_request_id: null,
    });
    const result = await adminDeletePlatformPopupDraftCampaign(sb as never, {
      campaignId: "c1",
      adminUserId: "admin-1",
    });
    expect(result).toEqual({ ok: true, id: "c1" });
    expect(sb._del).toHaveBeenCalled();
  });

  it("rejects non-admin-direct", async () => {
    const sb = mockSb({
      id: "c1",
      status: "draft",
      approval_status: "not_submitted",
      owner_store_id: "store-1",
      owner_request_id: null,
    });
    const result = await adminDeletePlatformPopupDraftCampaign(sb as never, {
      campaignId: "c1",
      adminUserId: "admin-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_admin_direct");
    expect(sb._del).not.toHaveBeenCalled();
  });

  it("rejects active campaign", async () => {
    const sb = mockSb({
      id: "c1",
      status: "active",
      approval_status: "approved",
      owner_store_id: null,
      owner_request_id: null,
    });
    const result = await adminDeletePlatformPopupDraftCampaign(sb as never, {
      campaignId: "c1",
      adminUserId: "admin-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_draft");
    expect(sb._del).not.toHaveBeenCalled();
  });
});
