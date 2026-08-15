import { describe, expect, it } from "vitest";
import {
  classifyMemberNotificationDomain,
  matchesMemberNotificationDomain,
} from "@/lib/notifications/member-notification-domain";
import { matchesNotificationCenterMemberTab } from "@/lib/notifications/notification-center-tab-match";
import { buildNotificationCenterTabUnreadCounts } from "@/lib/notifications/notification-center-tab-unread";
import {
  isNotificationOnlyInboxRow,
  resolveNotificationInboxHref,
} from "@/lib/notifications/resolve-notification-inbox-href";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import { buildPushEnvelopeV1DataFields } from "@/lib/push/push-envelope-v1";
import { resolvePushRouteFromFcmData } from "@/lib/push/resolve-push-route-from-fcm-data";

describe("member notification domain IA SSOT", () => {
  it("notice ≠ system isolation", () => {
    const notice = {
      push_kind: "notice",
      campaign_type: "notice",
      bell_presentation_type: "admin_notice",
      event_type: "notice_published",
    };
    const system = {
      push_kind: "system",
      campaign_type: "system",
      bell_presentation_type: "admin_system",
      event_type: "notice_published",
    };
    expect(classifyMemberNotificationDomain(notice)).toBe("notice");
    expect(classifyMemberNotificationDomain(system)).toBe("system");
    expect(matchesNotificationCenterMemberTab(notice, "notice")).toBe(true);
    expect(matchesNotificationCenterMemberTab(notice, "system")).toBe(false);
    expect(matchesNotificationCenterMemberTab(system, "system")).toBe(true);
    expect(matchesNotificationCenterMemberTab(system, "notice")).toBe(false);
  });

  it("tab badges isolate notice vs system unread", () => {
    const counts = buildNotificationCenterTabUnreadCounts({
      memberRows: [
        {
          is_read: false,
          push_kind: "notice",
          campaign_type: "notice",
          bell_presentation_type: "admin_notice",
          event_type: "notice_published",
        },
        {
          is_read: false,
          push_kind: "system",
          campaign_type: "system",
          bell_presentation_type: "admin_system",
          event_type: "notice_published",
        },
        {
          is_read: true,
          push_kind: "notice",
          campaign_type: "notice",
        },
      ],
    });
    expect(counts.all).toBe(2);
    expect(counts.notice).toBe(1);
    expect(counts.system).toBe(1);
    expect(counts.read).toBe(0);
  });

  it("content-bound campaign is not forced notification-only", () => {
    const row = {
      id: "evt-1",
      notification_type: "system",
      link_url: "/notifications",
      campaign_type: "notice",
      event_type: "notice_published",
      meta: {
        content_id: "content-1",
        content_type: "notice",
        canonical_route: "/mypage/customer-center/notice/content-1",
      },
    };
    expect(isNotificationOnlyInboxRow(row)).toBe(false);
    expect(resolveNotificationInboxHref(row)).toBe("/mypage/customer-center/notice/content-1");
    expect(
      resolveNotificationDestination({ inboxRow: row }).href
    ).toBe("/mypage/customer-center/notice/content-1");
  });

  it("unbound campaign still opens notification detail", () => {
    const row = {
      id: "evt-only",
      notification_type: "system",
      link_url: "/notifications",
      campaign_type: "notice",
      event_type: "notice_published",
      meta: null,
    };
    expect(isNotificationOnlyInboxRow(row)).toBe(true);
    expect(resolveNotificationInboxHref(row)).toBe("/notifications/evt-only");
  });

  it("admin_system push with approved content route opens CC system board", () => {
    const data = buildPushEnvelopeV1DataFields({
      eventClass: "admin_system",
      campaignChannel: "push_and_in_app",
      notificationEventId: "sys-evt-1",
      targetKind: "approved_internal_route",
      targetTab: "system",
      targetNotificationId: "sys-evt-1",
      approvedRoute: "/mypage/customer-center/system/sys-content-1",
    });
    expect(resolvePushRouteFromFcmData(data)).toBe(
      "/mypage/customer-center/system/sys-content-1"
    );
  });

  it("domain matrix classification smoke", () => {
    expect(
      matchesMemberNotificationDomain(
        { push_kind: "delivery", event_type: "order_status" },
        "delivery"
      )
    ).toBe(true);
    expect(
      matchesMemberNotificationDomain(
        { push_kind: "trade", event_type: "trade_message" },
        "trade"
      )
    ).toBe(true);
    expect(
      matchesMemberNotificationDomain(
        { event_type: "community_activity", push_kind: "community" },
        "community"
      )
    ).toBe(true);
    expect(
      matchesMemberNotificationDomain(
        { push_kind: "marketing", campaign_type: "marketing" },
        "marketing"
      )
    ).toBe(true);
  });
});
