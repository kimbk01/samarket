/**
 * Admin campaign inbox contracts — notice / system / marketing.
 */
import { describe, expect, it } from "vitest";
import {
  adminCampaignBellPresentation,
  adminCampaignEventClass,
  adminCampaignPushKind,
  isAdminMarketingInboxItem,
  isAdminNoticeOrSystemInboxItem,
  resolveAdminCampaignTypeFromInboxHints,
  resolveAdminCampaignTypeFromPayload,
} from "@/lib/notifications/admin-campaign-inbox";
import {
  mapNotificationEventToInboxRow,
  resolveBellPresentationType,
} from "@/lib/notifications/inbox-events-merge";
import { filterMarketingInboxDisplayRows } from "@/lib/notifications/notification-center-inbox-filter";
import { matchesNotificationCenterMemberTab } from "@/lib/notifications/notification-center-tab-match";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";

describe("admin-campaign-inbox Phase1 contracts", () => {
  it("push_kind / eventClass / bell presentation follow campaign type", () => {
    expect(adminCampaignPushKind("notice")).toBe("notice");
    expect(adminCampaignPushKind("system")).toBe("system");
    expect(adminCampaignPushKind("marketing")).toBe("marketing");
    expect(adminCampaignEventClass("system")).toBe("admin_system");
    expect(adminCampaignBellPresentation("system")).toBe("admin_system");
    expect(adminCampaignBellPresentation("notice")).toBe("admin_notice");
    expect(adminCampaignBellPresentation("marketing")).toBe("admin_marketing");
  });

  it("presentation meta uses distinct push_kind for system vs notice", () => {
    const notice = buildAdminCampaignNotificationPresentation({
      title: "N",
      body: "B",
      type: "notice",
      channel: "push_and_in_app",
      campaignId: "c1",
    });
    const system = buildAdminCampaignNotificationPresentation({
      title: "S",
      body: "B",
      type: "system",
      channel: "push_and_in_app",
      campaignId: "c2",
    });
    const marketing = buildAdminCampaignNotificationPresentation({
      title: "M",
      body: "B",
      type: "marketing",
      channel: "push_and_in_app",
      campaignId: "c3",
    });
    expect(notice.pushPayload.meta?.push_kind).toBe("notice");
    expect(notice.pushPayload.notification_type).toBe("notice");
    expect(notice.pushPayload.meta?.eventClass).toBe("admin_notice");
    expect(notice.eventType).toBe("notice_published");
    expect(notice.category).toBe("notice_published");
    expect(system.pushPayload.meta?.push_kind).toBe("system");
    expect(system.pushPayload.notification_type).toBe("system");
    expect(system.pushPayload.meta?.eventClass).toBe("admin_system");
    expect(system.eventType).toBe("notice_published");
    expect(marketing.pushPayload.meta?.push_kind).toBe("marketing");
    expect(marketing.bellPolicy).toBe("include");
    expect(marketing.eventType).toBe("admin_marketing_banner");
  });

  it("inbox map exposes campaign_type + distinct push_kind / presentation (legacy + typed)", () => {
    const noticeRow = mapNotificationEventToInboxRow({
      id: "e1",
      type: "notice_published",
      category: "notice_published",
      title: "공지",
      body: "본문",
      display_payload: { campaignType: "notice", routeUrl: "/notifications", previewKind: "admin_campaign" },
      read_at: null,
      created_at: "2026-08-04T00:00:00.000Z",
      dedupe_key: "d1",
      room_id: null,
    });
    const systemRow = mapNotificationEventToInboxRow({
      id: "e2",
      type: "notice_published",
      category: "notice_published",
      title: "시스템",
      body: "업데이트",
      display_payload: { campaignType: "system", routeUrl: "/notifications", previewKind: "admin_campaign" },
      read_at: null,
      created_at: "2026-08-04T00:00:00.000Z",
      dedupe_key: "d2",
      room_id: null,
    });
    const legacyNoticeRow = mapNotificationEventToInboxRow({
      id: "e1b",
      type: "admin_notice",
      category: "admin_notice",
      title: "레거시공지",
      body: "본문",
      display_payload: { campaignType: "notice", routeUrl: "/notifications", previewKind: "admin_campaign" },
      read_at: null,
      created_at: "2026-08-04T00:00:00.000Z",
      dedupe_key: "d1b",
      room_id: null,
    });
    const marketingRow = mapNotificationEventToInboxRow({
      id: "e3",
      type: "admin_marketing_banner",
      category: "admin_marketing_banner",
      title: "광고",
      body: "혜택",
      display_payload: { campaignType: "marketing", routeUrl: "/stores" },
      read_at: null,
      created_at: "2026-08-04T00:00:00.000Z",
      dedupe_key: "d3",
      room_id: null,
    });

    expect(noticeRow.push_kind).toBe("notice");
    expect(noticeRow.campaign_type).toBe("notice");
    expect(noticeRow.bell_presentation_type).toBe("admin_notice");
    expect(systemRow.push_kind).toBe("system");
    expect(systemRow.bell_presentation_type).toBe("admin_system");
    expect(legacyNoticeRow.bell_presentation_type).toBe("admin_notice");
    expect(marketingRow.push_kind).toBe("marketing");
    expect(resolveBellPresentationType({
      id: "e2",
      type: "notice_published",
      category: "notice_published",
      title: "S",
      body: "",
      display_payload: { campaignType: "system" },
      read_at: null,
      created_at: "2026-08-04T00:00:00.000Z",
      dedupe_key: "",
      room_id: "",
    })).toBe("admin_system");

    expect(isAdminNoticeOrSystemInboxItem(noticeRow)).toBe(true);
    expect(isAdminNoticeOrSystemInboxItem(systemRow)).toBe(true);
    expect(isAdminNoticeOrSystemInboxItem(marketingRow)).toBe(false);
    expect(isAdminMarketingInboxItem(marketingRow)).toBe(true);

    expect(matchesNotificationCenterMemberTab(noticeRow, "system")).toBe(true);
    expect(matchesNotificationCenterMemberTab(systemRow, "system")).toBe(true);
    expect(matchesNotificationCenterMemberTab(marketingRow, "marketing")).toBe(true);

    expect(filterMarketingInboxDisplayRows([noticeRow, systemRow, marketingRow]).map((r) => r.id)).toEqual([
      "e3",
    ]);
  });

  it("collapsed legacy system notification_type still resolves notice via push_kind", () => {
    expect(
      resolveAdminCampaignTypeFromInboxHints({
        notification_type: "system",
        push_kind: "notice",
        event_type: "admin_notice",
      })
    ).toBe("notice");
    expect(
      resolveAdminCampaignTypeFromPayload({ campaignType: "system" })
    ).toBe("system");
  });
});
