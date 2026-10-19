import { describe, expect, it } from "vitest";
import {
  listAdminNotificationCampaigns,
  pickLatestOccurrence,
} from "@/lib/admin/notification-campaigns/campaign-list-service";
import { parseCampaignListQuery } from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { createFakeSupabase, hasFilter } from "@/lib/admin/notification-campaigns/__tests__/fake-supabase-recorder";

const q = (s: string) => parseCampaignListQuery(new URLSearchParams(s));

describe("ADM-05 list service", () => {
  it("in_progress tab: non-archived, non-QA, tab statuses; author + delivered/opened joined", async () => {
    const { svc, calls } = createFakeSupabase((c) => {
      if (c.table === "admin_notification_campaigns") {
        return {
          data: [{ id: "c1", status: "sending", created_by: "u1", target_payload: {} }],
          count: 41,
        };
      }
      if (c.table === "admin_notification_campaign_occurrences") {
        return {
          data: [
            { id: "o-test", campaign_id: "c1", sequence_number: 3, trigger_type: "test", status: "sent" },
            { id: "o2", campaign_id: "c1", sequence_number: 2, trigger_type: "immediate", status: "sending", push_sent: 7 },
          ],
        };
      }
      if (c.table === "profiles") return { data: [{ id: "u1", nickname: "운영자" }] };
      if (c.table === "notification_campaign_deliveries") {
        return {
          data: [
            { occurrence_id: "o2", channel: "push" },
            { occurrence_id: "o2", channel: "in_app" },
            { occurrence_id: "o2", channel: "in_app" },
          ],
        };
      }
      return { data: [] };
    });
    const out = await listAdminNotificationCampaigns(svc as never, q("tab=in_progress&page=3&page_size=20&q=50%25"));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.total).toBe(41);
    expect(out.page).toBe(3);
    const list = calls.find((c) => c.table === "admin_notification_campaigns")!;
    expect(hasFilter(list, "is", "archived_at", null)).toBe(true);
    expect(hasFilter(list, "eq", "is_qa", false)).toBe(true);
    expect(hasFilter(list, "in", "status", ["scheduled", "sending", "active", "paused"])).toBe(true);
    expect(hasFilter(list, "ilike", "title", "%50\\%%")).toBe(true);
    const row = out.campaigns[0];
    expect(row.author_name).toBe("운영자");
    expect(row.latest_occurrence?.id).toBe("o2");
    expect(row.opened).toEqual({ push: 1, in_app: 2, capped: false });
  });

  it("archived tab filters archived_at not null; QA tab filters is_qa", async () => {
    const { svc, calls } = createFakeSupabase(() => ({ data: [], count: 0 }));
    await listAdminNotificationCampaigns(svc as never, q("tab=archived"));
    expect(hasFilter(calls[0], "not", "archived_at")).toBe(true);
    const qa = createFakeSupabase(() => ({ data: [], count: 0 }));
    await listAdminNotificationCampaigns(qa.svc as never, q("tab=qa"));
    expect(hasFilter(qa.calls[0], "eq", "is_qa", true)).toBe(true);
    expect(hasFilter(qa.calls[0], "is", "archived_at", null)).toBe(true);
  });

  it("archived_at not migrated yet: other tabs still list (no archive filter); archive tab empty", async () => {
    let first = true;
    const { svc, calls } = createFakeSupabase((c) => {
      if (c.table === "admin_notification_campaigns" && first) {
        first = false;
        return { error: { code: "42703", message: "column admin_notification_campaigns.archived_at does not exist" } };
      }
      return { data: [], count: 0 };
    });
    const out = await listAdminNotificationCampaigns(svc as never, q("tab=completed"));
    expect(out).toMatchObject({ ok: true, archive_supported: false });
    const retried = calls.filter((c) => c.table === "admin_notification_campaigns");
    expect(retried).toHaveLength(2);
    expect(hasFilter(retried[1], "is", "archived_at", null)).toBe(false);

    const arch = createFakeSupabase(() => ({
      error: { code: "42703", message: "column archived_at does not exist" },
    }));
    expect(await listAdminNotificationCampaigns(arch.svc as never, q("tab=archived"))).toMatchObject({
      ok: true,
      campaigns: [],
      archive_supported: false,
    });
  });

  it("pickLatestOccurrence prefers the latest real occurrence over test sends", () => {
    expect(
      pickLatestOccurrence([
        { id: "t", trigger_type: "test", sequence_number: 9 },
        { id: "r1", trigger_type: "scheduled", sequence_number: 1 },
        { id: "r2", trigger_type: "recurring", sequence_number: 2 },
      ])?.id
    ).toBe("r2");
    expect(pickLatestOccurrence([{ id: "t", trigger_type: "test", sequence_number: 1 }])?.id).toBe("t");
    expect(pickLatestOccurrence([])).toBeNull();
  });
});
