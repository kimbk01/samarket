import { beforeEach, describe, expect, it, vi } from "vitest";

const sendCampaignToUser = vi.fn();

vi.mock("@/lib/admin/notification-campaigns/campaign-send-user", () => ({
  sendCampaignToUser: (...args: unknown[]) => sendCampaignToUser(...args),
}));

type TargetRow = {
  campaign_id: string;
  user_id: string;
  status: "pending" | "sent" | "failed" | "skipped";
  failure_reason?: string | null;
  sent_at?: string | null;
};

function createSvcFixture(overrides?: Partial<{ status: string; channel: string }>) {
  const campaign = {
    id: "camp-1",
    type: "marketing",
    target_type: "selected_users",
    title: "promo",
    body: "sale",
    channel: overrides?.channel ?? "push_and_in_app",
    target_url: "/community",
    image_url: null,
    deeplink_url: "/community",
    web_url: null,
    push_image_url: null,
    in_app_image_url: null,
    priority: "normal",
    visibility_policy: "default",
    target_payload: {},
    segment_region_code: null,
    send_progress_offset: 0,
    status: overrides?.status ?? "draft",
    sent_count: 0,
    skipped_count: 0,
    failed_count: 0,
    target_count: 0,
  };
  const targets: TargetRow[] = [{ campaign_id: "camp-1", user_id: "u1", status: "pending" }];

  const svc = {
    from(table: string) {
      if (table === "admin_notification_campaigns") {
        return {
          select() {
            return {
              eq(_k: string, _v: string) {
                return {
                  maybeSingle: async () => ({ data: campaign, error: null }),
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq: async () => {
                Object.assign(campaign, patch);
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "notification_campaign_deliveries") {
        return {
          select: () => ({
            eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
          }),
          insert: async () => ({ data: { id: "d1" }, error: null }),
        };
      }
      if (table === "admin_notification_campaign_targets") {
        return {
          select(_cols: string, opts?: { count?: string; head?: boolean }) {
            if (opts?.count === "exact" && opts?.head) {
              return {
                eq(_k1: string, _v1: string) {
                  return {
                    eq: async (_k2: string, _v2: string) => ({
                      count: targets.filter((t) => t.status === "pending").length,
                    }),
                  };
                },
              };
            }
            return {
              eq(_k1: string, _v1: string) {
                return {
                  eq(_k2: string, _v2: string) {
                    return {
                      limit: async () => ({
                        data: targets
                          .filter((t) => t.status === "pending")
                          .map((t) => ({ user_id: t.user_id })),
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
          update(patch: Partial<TargetRow>) {
            return {
              eq(_k1: string, _v1: string) {
                return {
                  eq: async (_k2: string, userId: string) => {
                    const t = targets.find((r) => r.user_id === userId);
                    if (t) Object.assign(t, patch);
                    return { error: null };
                  },
                };
              },
            };
          },
          upsert: async () => ({ error: null }),
        };
      }
      if (table === "user_notification_settings") {
        return {
          select: () => ({
            in: async () => ({
              data: [{ user_id: "u1", service_enabled: true, marketing_enabled: true, notice_enabled: true }],
              error: null,
            }),
          }),
        };
      }
      if (table === "user_settings") {
        return {
          select: () => ({
            in: async () => ({
              data: [{ user_id: "u1", marketing_push_enabled: true, push_enabled: true }],
              error: null,
            }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      };
    },
  };

  return { svc, campaign, targets };
}

describe("runNotificationCampaignSendBatch Phase A", () => {
  beforeEach(() => {
    vi.resetModules();
    sendCampaignToUser.mockReset();
  });

  it("treats duplicate as sent via sendCampaignToUser skipped duplicate", async () => {
    sendCampaignToUser.mockResolvedValue({
      ok: true,
      sent: false,
      skipped: true,
      failed: false,
      skipReason: "duplicate_campaign_user",
      notificationEventId: null,
    });
    const { svc } = createSvcFixture();
    const { runNotificationCampaignSendBatch } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );

    const out = await runNotificationCampaignSendBatch(svc as never, "camp-1");

    expect(out.ok).toBe(true);
    expect(out.skipped).toBe(1);
    expect(sendCampaignToUser).toHaveBeenCalled();
  });

  it("calls sendCampaignToUser for eligible marketing user", async () => {
    sendCampaignToUser.mockResolvedValue({
      ok: true,
      sent: true,
      skipped: false,
      failed: false,
      skipReason: null,
      notificationEventId: "evt-1",
    });
    const { svc } = createSvcFixture();
    const { runNotificationCampaignSendBatch } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );

    const out = await runNotificationCampaignSendBatch(svc as never, "camp-1");

    expect(out.ok).toBe(true);
    expect(out.sent).toBe(1);
    expect(sendCampaignToUser).toHaveBeenCalledWith(
      svc,
      expect.objectContaining({ id: "camp-1", channel: "push_and_in_app" }),
      "u1",
      expect.any(Object)
    );
  });

  it("rejects batch send for test_only channel", async () => {
    const { svc } = createSvcFixture({ channel: "test_only" });
    const { runNotificationCampaignSendBatch } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );

    const out = await runNotificationCampaignSendBatch(svc as never, "camp-1");
    expect(out.ok).toBe(false);
    expect(out.error).toBe("test_only_use_test_send_endpoint");
  });

  it("blocks resend when campaign already sent", async () => {
    const { svc } = createSvcFixture({ status: "sent" });
    const { runNotificationCampaignSendBatch } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );

    const out = await runNotificationCampaignSendBatch(svc as never, "camp-1");
    expect(out.ok).toBe(false);
    expect(out.error).toBe("campaign_already_sent");
  });
});
