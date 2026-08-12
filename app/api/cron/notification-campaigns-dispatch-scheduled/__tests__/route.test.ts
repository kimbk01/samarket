import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyCronRequestAuthorization = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();
const claimDueOccurrence = vi.fn();
const getCampaignOccurrence = vi.fn();
const drainNotificationCampaignSendBatches = vi.fn();
const scheduleNextRecurringOccurrence = vi.fn();

vi.mock("@/lib/security/cron-auth", () => ({
  verifyCronRequestAuthorization: (...args: unknown[]) => verifyCronRequestAuthorization(...args),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: (...args: unknown[]) => tryCreateSupabaseServiceClient(...args),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-occurrence-service", () => ({
  claimDueOccurrence: (...args: unknown[]) => claimDueOccurrence(...args),
  getCampaignOccurrence: (...args: unknown[]) => getCampaignOccurrence(...args),
}));
vi.mock("@/lib/admin/notification-campaigns/claim-scheduled-campaign", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/notification-campaigns/claim-scheduled-campaign")
  >("@/lib/admin/notification-campaigns/claim-scheduled-campaign");
  return {
    ...actual,
    drainNotificationCampaignSendBatches: (...args: unknown[]) =>
      drainNotificationCampaignSendBatches(...args),
    scheduleNextRecurringOccurrence: (...args: unknown[]) => scheduleNextRecurringOccurrence(...args),
  };
});

describe("GET /api/cron/notification-campaigns-dispatch-scheduled", () => {
  beforeEach(() => {
    vi.resetModules();
    verifyCronRequestAuthorization.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
    claimDueOccurrence.mockReset();
    getCampaignOccurrence.mockReset();
    drainNotificationCampaignSendBatches.mockReset();
    scheduleNextRecurringOccurrence.mockReset();
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
    // recurring backfill query + optional occurrence update
    const from = vi.fn((table: string) => {
      if (table === "admin_notification_campaigns") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        };
      }
      return {
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({ count: 0, error: null }),
          })),
        })),
      };
    });
    tryCreateSupabaseServiceClient.mockReturnValue({ from });
    claimDueOccurrence
      .mockResolvedValueOnce({
        id: "occ-1",
        campaign_id: "camp-1",
        trigger_type: "scheduled",
        status: "sending",
      })
      .mockResolvedValueOnce(null);
    drainNotificationCampaignSendBatches.mockResolvedValue({
      ok: true,
      done: true,
      batches: 2,
      sent: 3,
      skipped: 0,
      failed: 0,
    });
    getCampaignOccurrence.mockResolvedValue({
      id: "occ-1",
      campaign_id: "camp-1",
      trigger_type: "scheduled",
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
      "occ-1",
      expect.any(Object)
    );
  });

  it("surfaces segment_unsupported from batch SSOT without fallback drain success", async () => {
    verifyCronRequestAuthorization.mockReturnValue(true);
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const from = vi.fn((table: string) => {
      if (table === "admin_notification_campaigns") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        };
      }
      return { update };
    });
    tryCreateSupabaseServiceClient.mockReturnValue({ from });
    claimDueOccurrence
      .mockResolvedValueOnce({
        id: "occ-seg",
        campaign_id: "camp-seg",
        trigger_type: "scheduled",
        status: "sending",
      })
      .mockResolvedValueOnce(null);
    drainNotificationCampaignSendBatches.mockResolvedValue({
      ok: false,
      done: true,
      batches: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: "segment_unsupported",
    });

    const { GET } = await import(
      "@/app/api/cron/notification-campaigns-dispatch-scheduled/route"
    );
    const res = await GET(new Request("http://localhost/api/cron/notification-campaigns-dispatch-scheduled"));
    const body = (await res.json()) as {
      results?: Array<{ error?: string; campaignId?: string; ok?: boolean }>;
    };
    expect(body.results?.[0]?.error).toBe("segment_unsupported");
    expect(body.results?.[0]?.ok).toBe(false);
    expect(drainNotificationCampaignSendBatches).toHaveBeenCalledWith(
      expect.anything(),
      "occ-seg",
      expect.any(Object)
    );
    expect(update).toHaveBeenCalled();
  });
});
