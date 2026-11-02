import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import { appendCampaignPushOpenParam, CAMPAIGN_PUSH_OPEN_PARAM } from "@/lib/notifications/campaign-push-open-param";
import { pathsMatchForPushConsume } from "@/lib/push/push-route-consume-contract";
import { resolveRouteFromPushEnvelopeV1, parsePushEnvelopeV1 } from "@/lib/push/push-envelope-v1";

/** 푸시 전용 알림 열람 기록 (docs/audit/push-only-open-tracking-design-2026-11-02.md · Owner 승인 2026-11-02). */
const OCC = "43440c34-e88b-42b2-ba99-9d565f0613a3";
const campaign = {
  title: "실기",
  body: "본문",
  type: "notice" as const,
  channel: "push_only" as const,
  deeplink_url: null,
  web_url: null,
  target_type: "selected_users",
  campaignId: "5d59f734-e1f3-4a50-ab32-d96de011cf68",
  appNoticeId: "366d11ab-c19f-497a-9894-04ff4f3225bc",
  contentType: "notice",
};

describe("campaign push open param", () => {
  it("append keeps existing query and hash", () => {
    expect(appendCampaignPushOpenParam("/a/b", OCC)).toBe(`/a/b?${CAMPAIGN_PUSH_OPEN_PARAM}=${OCC}`);
    expect(appendCampaignPushOpenParam("/a?x=1#h", OCC)).toBe(`/a?x=1&${CAMPAIGN_PUSH_OPEN_PARAM}=${OCC}#h`);
    expect(appendCampaignPushOpenParam("/a", "not-uuid")).toBe("/a");
  });

  it("push-only real send carries the occurrence on the destination (link_url · targetApprovedRoute)", () => {
    const p = buildAdminCampaignNotificationPresentation(campaign, { userId: "u1", notificationEventId: null, occurrenceId: OCC });
    const meta = p.pushPayload.meta as Record<string, unknown>;
    expect(p.pushPayload.link_url).toBe(`/mypage/customer-center/notice/${campaign.appNoticeId}?notif_open=${OCC}`);
    expect(meta.targetApprovedRoute).toBe(p.pushPayload.link_url);
  });

  it("send with an inbox row, preview, or no occurrence → destination unchanged", () => {
    const withRow = buildAdminCampaignNotificationPresentation(
      { ...campaign, channel: "push_and_in_app" },
      { userId: "u1", notificationEventId: "e1", occurrenceId: OCC }
    );
    expect(String(withRow.pushPayload.link_url)).not.toContain(CAMPAIGN_PUSH_OPEN_PARAM);
    const preview = buildAdminCampaignNotificationPresentation(campaign, { occurrenceId: OCC });
    expect(String(preview.pushPayload.link_url)).not.toContain(CAMPAIGN_PUSH_OPEN_PARAM);
    const noOcc = buildAdminCampaignNotificationPresentation(campaign, { userId: "u1", notificationEventId: null });
    expect(String(noOcc.pushPayload.link_url)).not.toContain(CAMPAIGN_PUSH_OPEN_PARAM);
  });

  it("web/iOS envelope resolver opens the route with the query intact", () => {
    const p = buildAdminCampaignNotificationPresentation(campaign, { userId: "u1", notificationEventId: null, occurrenceId: OCC });
    const meta = p.pushPayload.meta as Record<string, unknown>;
    const data: Record<string, unknown> = {
      schemaVersion: meta.schemaVersion,
      eventClass: meta.eventClass,
      campaignChannel: meta.campaignChannel,
      targetKind: meta.targetKind,
      targetTab: meta.targetTab,
      targetApprovedRoute: meta.targetApprovedRoute,
    };
    const parsed = parsePushEnvelopeV1(data as never);
    expect(parsed.present).toBe(true);
    if (parsed.present) expect(resolveRouteFromPushEnvelopeV1(parsed).path).toContain(`notif_open=${OCC}`);
  });

  it("arrival check ignores the marker (the screen strips it) — no re-navigation loop", () => {
    expect(pathsMatchForPushConsume("/mypage/customer-center/notice/x", `/mypage/customer-center/notice/x?notif_open=${OCC}`)).toBe(true);
    expect(pathsMatchForPushConsume("/a?x=1", `/a?x=1&notif_open=${OCC}`)).toBe(true);
    expect(pathsMatchForPushConsume("/a?x=2", `/a?x=1&notif_open=${OCC}`)).toBe(false);
  });
});

const getRouteUserId = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: () => getRouteUserId() }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient() }));

describe("POST /api/me/notifications/campaign-push-opened", () => {
  beforeEach(() => {
    getRouteUserId.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
  });
  const req = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }) as never;

  it("401 without login · 400 for a bad id", async () => {
    const { POST } = await import("@/app/api/me/notifications/campaign-push-opened/route");
    getRouteUserId.mockResolvedValue(null);
    expect((await POST(req({ occurrence_id: OCC }))).status).toBe(401);
    getRouteUserId.mockResolvedValue("u1");
    expect((await POST(req({ occurrence_id: "x" }))).status).toBe(400);
  });

  it("updates only the caller's sent push rows of that occurrence", async () => {
    const filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | null = null;
    const q = {
      update: (p: Record<string, unknown>) => ((patch = p), q),
      eq: (c: string, v: unknown) => (filters.push([c, v]), q),
      select: async () => ({ data: [{ id: "d1" }, { id: "d2" }], error: null }),
    };
    tryCreateSupabaseServiceClient.mockReturnValue({ from: (t: string) => (filters.push(["table", t]), q) });
    getRouteUserId.mockResolvedValue("u1");
    const { POST } = await import("@/app/api/me/notifications/campaign-push-opened/route");
    const res = await POST(req({ occurrence_id: OCC }));
    expect(await res.json()).toEqual({ ok: true, updated: 2 });
    expect(filters).toEqual([
      ["table", "notification_campaign_deliveries"],
      ["occurrence_id", OCC],
      ["user_id", "u1"],
      ["channel", "push"],
      ["status", "sent"],
    ]);
    expect(patch).toMatchObject({ status: "opened" });
  });
});
