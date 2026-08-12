import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApiUser = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();
const ensureCampaignTargetsForSelectedUsers = vi.fn();
const previewCampaignAudience = vi.fn();
const ensureCampaignOccurrence = vi.fn();

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: () => requireAdminApiUser(),
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient(),
}));

vi.mock("@/lib/admin/notification-campaigns/run-campaign-send-batch", () => ({
  ensureCampaignTargetsForSelectedUsers: (...args: unknown[]) =>
    ensureCampaignTargetsForSelectedUsers(...args),
}));

vi.mock("@/lib/admin/notification-campaigns/campaign-audience-preview", () => ({
  previewCampaignAudience: (...args: unknown[]) => previewCampaignAudience(...args),
}));

vi.mock("@/lib/admin/notification-campaigns/campaign-occurrence-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/notification-campaigns/campaign-occurrence-service")
  >("@/lib/admin/notification-campaigns/campaign-occurrence-service");
  return {
    ...actual,
    ensureCampaignOccurrence: (...args: unknown[]) => ensureCampaignOccurrence(...args),
  };
});

describe("POST /api/admin/notification-campaigns target_payload contract", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminApiUser.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
    ensureCampaignTargetsForSelectedUsers.mockReset();
    previewCampaignAudience.mockReset();
    ensureCampaignOccurrence.mockReset();
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    previewCampaignAudience.mockResolvedValue({
      totalUsers: 0,
      eligibleUsers: 0,
      pushEligibleUsers: 0,
      inAppEligibleUsers: 0,
      activeDevices: 0,
      androidDevices: 0,
      iosDevices: 0,
      webDevices: 0,
      excludedNoDevice: 0,
      excludedOptOut: 0,
      excludedInvalidTarget: 0,
      truncated: false,
      segmentUnsupported: false,
    });
    ensureCampaignOccurrence.mockResolvedValue({
      ok: true,
      occurrence: { id: "occ-1" },
      created: true,
    });
    ensureCampaignTargetsForSelectedUsers.mockResolvedValue(undefined);
  });

  function mockInsertCapture() {
    const inserted: Record<string, unknown>[] = [];
    const svc = {
      from: vi.fn(() => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id: "camp-1" }, error: null }),
            }),
          };
        },
      })),
    };
    tryCreateSupabaseServiceClient.mockReturnValue(svc);
    return inserted;
  }

  it("omitted target_payload inserts {}", async () => {
    const inserted = mockInsertCapture();
    const { POST } = await import("@/app/api/admin/notification-campaigns/route");
    const res = await POST(
      new Request("http://localhost/api/admin/notification-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "t",
          body: "b",
          type: "system",
          channel: "test_only",
          target_type: "selected_users",
          target_user_ids: ["u1"],
        }),
      }) as never
    );
    expect(res.status).toBe(200);
    expect(inserted[0]?.target_payload).toEqual({});
  });

  it("preserves provided target_payload object", async () => {
    const inserted = mockInsertCapture();
    const { POST } = await import("@/app/api/admin/notification-campaigns/route");
    const res = await POST(
      new Request("http://localhost/api/admin/notification-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "t",
          body: "b",
          type: "system",
          target_payload: { custom: true },
        }),
      }) as never
    );
    expect(res.status).toBe(200);
    expect(inserted[0]?.target_payload).toEqual({ custom: true });
  });

  it("rejects explicit null target_payload with 400", async () => {
    const inserted = mockInsertCapture();
    const { POST } = await import("@/app/api/admin/notification-campaigns/route");
    const res = await POST(
      new Request("http://localhost/api/admin/notification-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "t",
          body: "b",
          type: "system",
          target_payload: null,
        }),
      }) as never
    );
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
    const j = await res.json();
    expect(j.error).toBe("invalid_target_payload");
  });

  it("maps app_notice_id into target_payload", async () => {
    const inserted = mockInsertCapture();
    const { POST } = await import("@/app/api/admin/notification-campaigns/route");
    const res = await POST(
      new Request("http://localhost/api/admin/notification-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "t",
          body: "b",
          type: "notice",
          app_notice_id: "n-1",
        }),
      }) as never
    );
    expect(res.status).toBe(200);
    expect(inserted[0]?.target_payload).toEqual({ appNoticeId: "n-1" });
  });
});
