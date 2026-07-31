import { describe, expect, it, vi, beforeEach } from "vitest";

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
  return {
    rpc,
    from,
  } as never;
}

describe("claim-scheduled-campaign", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it("returns null when RPC yields empty", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const out = await claimDueScheduledCampaign(mockSvc(), { claimToken: "tok" });
    expect(out).toBeNull();
    expect(rpc).toHaveBeenCalledWith(
      "claim_due_admin_notification_campaign",
      expect.objectContaining({ p_claim_token: "tok" })
    );
  });

  it("returns claimed campaign row", async () => {
    rpc.mockResolvedValue({
      data: [{ id: "camp-1", status: "sending", target_type: "all" }],
      error: null,
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
          campaign: { id: "camp-1", status: "sending", send_idempotency_key: "k1" },
        },
      ],
      error: null,
    });
    const out = await claimAdminCampaignManualSend(mockSvc(), "camp-1", {
      idempotencyKey: "k1",
      claimToken: "tok",
    });
    expect(out.claimed).toBe(false);
    expect(out.alreadyRunning).toBe(true);
    expect(out.campaign?.id).toBe("camp-1");
  });

  it("drains batches until done", async () => {
    const out = await drainNotificationCampaignSendBatches(mockSvc(), "camp-1", {
      maxBatches: 5,
      maxWallMs: 10_000,
    });
    expect(out.ok).toBe(true);
    expect(out.done).toBe(true);
    expect(out.batches).toBe(1);
    expect(out.sent).toBe(1);
  });
});
