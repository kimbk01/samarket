import { describe, expect, it } from "vitest";
import { filterMappedInboxEventRows } from "@/lib/notifications/inbox-events-merge";
import { matchesNotificationCenterMemberTab } from "@/lib/notifications/notification-center-tab-match";
import { buildNotificationCenterTabUnreadCounts } from "@/lib/notifications/notification-center-tab-unread";

describe("notification center system tab includes admin_notice", () => {
  it("matchesNotificationCenterMemberTab system includes notice push_kind", () => {
    expect(
      matchesNotificationCenterMemberTab(
        {
          push_kind: "notice",
          notification_type: "system",
          bell_presentation_type: "admin_notice",
        },
        "system"
      )
    ).toBe(true);
  });

  it("filterMappedInboxEventRows system includes admin_notice rows", () => {
    const rows = [
      {
        id: "1",
        source: "event" as const,
        notification_type: "system",
        title: "n",
        body: "b",
        link_url: null,
        is_read: false,
        created_at: "2026-08-03T00:00:00.000Z",
        meta: null,
        domain: null,
        ref_id: null,
        push_kind: "notice",
        dedupe_key: "d1",
        bell_presentation_type: "admin_notice" as const,
      },
    ];
    const filtered = filterMappedInboxEventRows(rows, {
      fetchUpper: 80,
      inboxPushKind: "system",
    });
    expect(filtered).toHaveLength(1);
  });

  it("tab unread counts put admin_notice on system; 전체 carries total unread", () => {
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
    expect(counts.all).toBe(2);
    expect(counts.read).toBe(0);
    expect(counts.unread).toBe(2);
    expect(counts.system).toBe(1);
    expect(counts.trade).toBe(1);
  });
});
