import { describe, expect, it } from "vitest";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import { defaultInboxFallbackHref } from "@/lib/notifications/resolve-notification-inbox-href";
import { resolveNotificationDestinationHint } from "@/lib/notifications/notification-destination-hint";
import { buildNotificationCenterTabUnreadCounts } from "@/lib/notifications/notification-center-tab-unread";

describe("notification UX contract bundle (badge / CTA / row hint)", () => {
  it("전체 tab carries total unread; read stays 0", () => {
    const counts = buildNotificationCenterTabUnreadCounts({
      memberRows: [
        { is_read: false, notification_type: "status" },
        { is_read: true, notification_type: "status" },
      ],
    });
    expect(counts.all).toBe(1);
    expect(counts.read).toBe(0);
    expect(counts.unread).toBe(1);
  });

  it("bare /notifications becomes explicit origin-unavailable fallback", () => {
    const dest = resolveNotificationDestination({
      resolverKey: "display_route",
      displayRoute: "/notifications",
    });
    expect(dest.href).toBe(defaultInboxFallbackHref());
    expect(dest.kind).toBe("inbox_fallback");
    expect(dest.destinationType).toBe("origin_unavailable");
  });

  it("notification-only inbox rows open notification detail", () => {
    const dest = resolveNotificationDestination({
      inboxRow: {
        id: "notice-evt-1",
        notification_type: "system",
        link_url: "/notifications",
        campaign_type: "notice",
      },
    });
    expect(dest.href).toBe("/notifications/notice-evt-1");
    expect(dest.kind).toBe("notification_detail");
  });

  it("content-bound notice wins over bare notifications / notification-only", () => {
    const dest = resolveNotificationDestination({
      inboxRow: {
        id: "notice-evt-bound",
        notification_type: "system",
        link_url: "/notifications",
        campaign_type: "notice",
        meta: {
          content_id: "cc-notice-1",
          content_type: "notice",
          canonical_route: "/mypage/customer-center/notice/cc-notice-1",
        },
      },
    });
    expect(dest.href).toBe("/mypage/customer-center/notice/cc-notice-1");
    expect(dest.kind).toBe("canonical");
  });

  it("bare /notifications inbox rows without notification-only identity become fallback", () => {
    const dest = resolveNotificationDestination({
      inboxRow: {
        id: "legacy-1",
        notification_type: "system",
        link_url: "/notifications",
        meta: null,
      },
    });
    expect(dest.href).toBe(defaultInboxFallbackHref());
    expect(dest.kind).toBe("inbox_fallback");
  });

  it("exact trade post CTA stays exact", () => {
    const dest = resolveNotificationDestination({
      inboxRow: {
        notification_type: "status",
        link_url: "/post/abc",
        meta: null,
      },
    });
    expect(dest.href).toBe("/post/abc");
    expect(dest.kind).toBe("canonical");
    expect(resolveNotificationDestinationHint(dest.href, "ko")).toContain("거래");
  });

  it("intentional Notification Center hub is not classified as origin-unavailable fallback", () => {
    // See-all uses bare /notifications intentionally — distinct from fallback query.
    expect(defaultInboxFallbackHref()).toBe("/notifications?fallback=origin_unavailable");
    expect(defaultInboxFallbackHref()).not.toBe("/notifications");
  });

  it("origin-unavailable hint is explicit", () => {
    expect(
      resolveNotificationDestinationHint(defaultInboxFallbackHref(), "ko")
    ).toContain("원본을 찾을 수 없음");
  });

  it("customer-center content destinations keep board labels", () => {
    expect(
      resolveNotificationDestinationHint("/mypage/customer-center/system/abc", "ko")
    ).toContain("시스템");
    expect(
      resolveNotificationDestinationHint("/mypage/customer-center/marketing/abc", "ko")
    ).toContain("마케팅");
  });
});
