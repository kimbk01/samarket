import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/lib/admin/notification-campaigns/run-campaign-send-batch", () => ({
  runNotificationCampaignSendBatch: vi.fn(async () => ({
    ok: true,
    processed: 1,
    sent: 1,
    skipped: 0,
    failed: 0,
    done: true,
  })),
}));

import {
  claimDueScheduledCampaign,
  claimAdminCampaignManualSend,
  drainNotificationCampaignSendBatches,
} from "@/lib/admin/notification-campaigns/claim-scheduled-campaign";

function mockSvc() {
  return { rpc, from } as never;
}

describe("claim-scheduled-campaign occurrence", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it("claimDueScheduledCampaign returns campaign via occurrence RPC", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_due_admin_notification_campaign_occurrence") {
        return { data: [{ id: "occ-1", campaign_id: "camp-1", status: "sending" }], error: null };
      }
      return { data: null, error: null };
    });
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "camp-1", status: "sending" }, error: null }),
        }),
      }),
    });

    const out = await claimDueScheduledCampaign(mockSvc(), { claimToken: "tok" });
    expect(out?.id).toBe("camp-1");
  });

  it("manual claim reports already_running for same idempotency key", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          claimed: false,
          already_running: true,
          occurrence: { id: "occ-1", status: "sending", idempotency_key: "k1" },
        },
      ],
      error: null,
    });
    const out = await claimAdminCampaignManualSend(mockSvc(), "occ-1", {
      idempotencyKey: "k1",
      claimToken: "tok",
    });
    expect(out.claimed).toBe(false);
    expect(out.alreadyRunning).toBe(true);
    expect(out.occurrence?.id).toBe("occ-1");
  });

  it("drains batches until done", async () => {
    const out = await drainNotificationCampaignSendBatches(mockSvc(), "occ-1", {
      maxBatches: 5,
      maxWallMs: 10_000,
    });
    expect(out.ok).toBe(true);
    expect(out.done).toBe(true);
    expect(out.batches).toBe(1);
    expect(out.sent).toBe(1);
  });
});
