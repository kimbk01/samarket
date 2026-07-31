import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyCronRequestAuthorization = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();
const claimDueScheduledCampaign = vi.fn();
const drainNotificationCampaignSendBatches = vi.fn();

vi.mock("@/lib/security/cron-auth", () => ({
  verifyCronRequestAuthorization: (...args: unknown[]) => verifyCronRequestAuthorization(...args),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: (...args: unknown[]) => tryCreateSupabaseServiceClient(...args),
}));
vi.mock("@/lib/admin/notification-campaigns/claim-scheduled-campaign", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/notification-campaigns/claim-scheduled-campaign")
  >("@/lib/admin/notification-campaigns/claim-scheduled-campaign");
  return {
    ...actual,
    claimDueScheduledCampaign: (...args: unknown[]) => claimDueScheduledCampaign(...args),
    drainNotificationCampaignSendBatches: (...args: unknown[]) =>
      drainNotificationCampaignSendBatches(...args),
  };
});

describe("GET /api/cron/notification-campaigns-dispatch-scheduled", () => {
  beforeEach(() => {
    vi.resetModules();
    verifyCronRequestAuthorization.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
    claimDueScheduledCampaign.mockReset();
    drainNotificationCampaignSendBatches.mockReset();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  it("returns 401 when unauthorized", async () => {
    verifyCronRequestAuthorization.mockReturnValue(false);
    const { GET } = await import(
      "@/app/api/cron/notification-campaigns-dispatch-scheduled/route"
    );
    const res = await GET(new Request("http://localhost/api/cron/notification-campaigns-dispatch-scheduled"));
    expect(res.status).toBe(401);
  });

  it("claims due campaigns and drains existing batch SSOT", async () => {
    verifyCronRequestAuthorization.mockReturnValue(true);
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    tryCreateSupabaseServiceClient.mockReturnValue({ from: () => ({ update }) });
    claimDueScheduledCampaign
      .mockResolvedValueOnce({ id: "camp-1", target_type: "all", status: "sending" })
      .mockResolvedValueOnce(null);
    drainNotificationCampaignSendBatches.mockResolvedValue({
      ok: true,
      done: true,
      batches: 2,
      sent: 3,
      skipped: 0,
      failed: 0,
    });

    const { GET } = await import(
      "@/app/api/cron/notification-campaigns-dispatch-scheduled/route"
    );
    const res = await GET(
      new Request("http://localhost/api/cron/notification-campaigns-dispatch-scheduled", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = (await res.json()) as { ok?: boolean; claimed?: number; results?: unknown[] };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.claimed).toBe(1);
    expect(drainNotificationCampaignSendBatches).toHaveBeenCalledWith(
      expect.anything(),
      "camp-1",
      expect.any(Object)
    );
  });

  it("blocks segment campaigns without falling back to all", async () => {
    verifyCronRequestAuthorization.mockReturnValue(true);
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    tryCreateSupabaseServiceClient.mockReturnValue({ from: () => ({ update }) });
    claimDueScheduledCampaign
      .mockResolvedValueOnce({ id: "camp-seg", target_type: "segment", status: "sending" })
      .mockResolvedValueOnce(null);

    const { GET } = await import(
      "@/app/api/cron/notification-campaigns-dispatch-scheduled/route"
    );
    const res = await GET(new Request("http://localhost/api/cron/notification-campaigns-dispatch-scheduled"));
    const body = (await res.json()) as {
      results?: Array<{ error?: string; campaignId?: string }>;
    };
    expect(body.results?.[0]?.error).toBe("segment_unsupported");
    expect(drainNotificationCampaignSendBatches).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });
});
