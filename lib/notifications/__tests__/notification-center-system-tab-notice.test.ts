import { describe, expect, it } from "vitest";
import { matchesNotificationCenterMemberTab } from "@/lib/notifications/notification-center-tab-match";
import { buildNotificationCenterTabUnreadCounts } from "@/lib/notifications/notification-center-tab-unread";

describe("notification center notice ≠ system isolation", () => {
  it("matchesNotificationCenterMemberTab: notice push_kind is notice only", () => {
    const noticeRow = {
      push_kind: "notice",
      notification_type: "system",
      bell_presentation_type: "admin_notice",
    };
    expect(matchesNotificationCenterMemberTab(noticeRow, "notice")).toBe(true);
    expect(matchesNotificationCenterMemberTab(noticeRow, "system")).toBe(false);
  });

  it("matchesNotificationCenterMemberTab: admin_system is system only", () => {
    const systemRow = {
      push_kind: "system",
      notification_type: "system",
      bell_presentation_type: "admin_system",
    };
    expect(matchesNotificationCenterMemberTab(systemRow, "system")).toBe(true);
    expect(matchesNotificationCenterMemberTab(systemRow, "notice")).toBe(false);
  });

  it("tab unread counts isolate notice vs system; 전체 carries total unread", () => {
    const counts = buildNotificationCenterTabUnreadCounts({
      memberRows: [
        {
          is_read: false,
          push_kind: "notice",
          notification_type: "system",
          bell_presentation_type: "admin_notice",
        },
        {
          is_read: false,
          push_kind: "system",
          notification_type: "system",
          bell_presentation_type: "admin_system",
        },
        {
          is_read: false,
          push_kind: "trade",
          notification_type: "status",
          bell_presentation_type: "trade_status",
        },
        {
          is_read: true,
          push_kind: "trade",
          notification_type: "status",
          bell_presentation_type: "trade_status",
        },
      ],
    });
    expect(counts.all).toBe(3);
    expect(counts.unread).toBe(3);
    expect(counts.notice).toBe(1);
    expect(counts.system).toBe(1);
    expect(counts.trade).toBe(1);
    expect("cs" in counts).toBe(false);
  });
});
