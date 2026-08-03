import { describe, expect, it } from "vitest";
import {
  filterMarketingInboxDisplayRows,
  isMarketingInboxDisplayRow,
} from "@/lib/notifications/notification-center-inbox-filter";
import { filterMemberNotificationAInboxRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";

describe("notification-center-inbox-filter — 혜택 ≠ Bell digit", () => {
  it("marketing rows are display-only identity", () => {
    expect(
      isMarketingInboxDisplayRow({
        notification_type: "admin_marketing_banner",
      })
    ).toBe(true);
    expect(
      isMarketingInboxDisplayRow({
        notification_type: "admin_notice",
      })
    ).toBe(false);
  });

  it("marketing filter keeps marketing and drops notices", () => {
    const rows = [
      { id: "a1", notification_type: "admin_notice", is_read: false, meta: {} },
      {
        id: "mk",
        notification_type: "admin_marketing_banner",
        is_read: false,
        meta: {},
      },
    ];
    expect(filterMarketingInboxDisplayRows(rows).map((r) => r.id)).toEqual(["mk"]);
  });

  it("A filter excludes marketing from Bell digit set", () => {
    const rows = [
      { id: "a1", notification_type: "admin_notice", is_read: false, meta: {}, dedupe_key: "n1" },
      {
        id: "mk",
        notification_type: "admin_marketing_banner",
        is_read: false,
        meta: {},
        dedupe_key: "m1",
      },
    ];
    expect(filterMemberNotificationAInboxRows(rows).map((r) => r.id)).toEqual(["a1"]);
  });
});
