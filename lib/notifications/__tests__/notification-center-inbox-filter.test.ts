import { describe, expect, it } from "vitest";
import {
  filterNotificationCenterListRows,
  isMarketingInboxDisplayRow,
} from "@/lib/notifications/notification-center-inbox-filter";

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

  it("marketing tab keeps marketing and drops A-only rows", () => {
    const rows = [
      { id: "a1", notification_type: "admin_notice", is_read: false, meta: {} },
      {
        id: "mk",
        notification_type: "admin_marketing_banner",
        is_read: false,
        meta: {},
      },
    ];
    expect(filterNotificationCenterListRows(rows, "marketing").map((r) => r.id)).toEqual([
      "mk",
    ]);
  });

  it("system/all tabs exclude marketing from A list", () => {
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
    expect(filterNotificationCenterListRows(rows, "all").map((r) => r.id)).toEqual(["a1"]);
    expect(filterNotificationCenterListRows(rows, "system").map((r) => r.id)).toEqual(["a1"]);
  });
});
