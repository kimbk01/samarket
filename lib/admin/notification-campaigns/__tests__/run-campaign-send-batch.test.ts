import { beforeEach, describe, expect, it, vi } from "vitest";

const createAndDispatchNotificationEvent = vi.fn();

vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: (...args: unknown[]) =>
    createAndDispatchNotificationEvent(...args),
}));

type TargetRow = {
  campaign_id: string;
  user_id: string;
  status: "pending" | "sent" | "failed" | "skipped";
  failure_reason?: string | null;
  sent_at?: string | null;
};

function createSvcFixture() {
  const campaign = {
    id: "camp-1",
    type: "marketing",
    target_type: "selected_users",
    title: "promo",
    body: "sale",
    target_url: "/community",
    image_url: null,
    segment_region_code: null,
    send_progress_offset: 0,
    status: "scheduled",
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
              data: [{ user_id: "u1", service_enabled: true, marketing_enabled: true }],
              error: null,
            }),
          }),
        };
      }
      if (table === "user_settings") {
        return {
          select: () => ({
            in: async () => ({
              data: [{ user_id: "u1", marketing_push_enabled: true }],
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

describe("runNotificationCampaignSendBatch duplicate prevention", () => {
  beforeEach(() => {
    vi.resetModules();
    createAndDispatchNotificationEvent.mockReset();
  });

  it("treats duplicate notification_event as sent without failed increment", async () => {
    createAndDispatchNotificationEvent.mockResolvedValue({
      ok: false,
      error: "duplicate",
      duplicate: true,
    });
    const { svc, targets } = createSvcFixture();
    const { runNotificationCampaignSendBatch } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );

    const out = await runNotificationCampaignSendBatch(svc as never, "camp-1");

    expect(out.ok).toBe(true);
    expect(out.sent).toBe(1);
    expect(out.failed).toBe(0);
    expect(out.done).toBe(true);
    expect(targets[0]?.status).toBe("sent");
  });
});
