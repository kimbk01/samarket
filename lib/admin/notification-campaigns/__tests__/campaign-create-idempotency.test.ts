import { describe, expect, it, vi } from "vitest";
import { findCampaignByCreateRequestId } from "@/lib/admin/notification-campaigns/campaign-create-service";

describe("campaign create idempotency", () => {
  it("findCampaignByCreateRequestId returns existing row", async () => {
    const svc = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: "camp-dup" } }),
          }),
        }),
      }),
    } as never;

    const found = await findCampaignByCreateRequestId(svc, "req-123");
    expect(found?.id).toBe("camp-dup");
  });

  it("findCampaignByCreateRequestId returns null when missing", async () => {
    const svc = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    } as never;

    const found = await findCampaignByCreateRequestId(svc, "req-missing");
    expect(found).toBeNull();
  });
});
