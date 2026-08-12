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
    expect(dest.destinationType).toBe("origin_unavailable");
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
    expect(resolveNotificationDestinationHint(dest.href, "ko")).toContain("거래");
  });

  it("origin-unavailable hint is explicit", () => {
    expect(
      resolveNotificationDestinationHint(defaultInboxFallbackHref(), "ko")
    ).toContain("원본을 찾을 수 없음");
  });
});
