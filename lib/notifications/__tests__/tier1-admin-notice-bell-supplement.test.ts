import { beforeEach, describe, expect, it, vi } from "vitest";

let eventsSnap: { adminNotice?: number } | null = { adminNotice: 2 };

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  getNotificationBadgeCountSnapshot: () => eventsSnap,
}));

import { resolveTier1AdminNoticeBellSupplement } from "@/lib/notifications/tier1-admin-notice-bell-supplement";

describe("tier1 admin notice bell supplement", () => {
  beforeEach(() => {
    eventsSnap = { adminNotice: 2 };
  });

  it("adds admin_notice only for tier1_inbox_bell surface", () => {
    expect(resolveTier1AdminNoticeBellSupplement("tier1_inbox_bell")).toBe(2);
    expect(resolveTier1AdminNoticeBellSupplement("bottom_nav_community")).toBe(0);
    expect(resolveTier1AdminNoticeBellSupplement("bottom_nav_chat")).toBe(0);
  });

  it("returns zero when notification_events snapshot is absent", () => {
    eventsSnap = null;
    expect(resolveTier1AdminNoticeBellSupplement("tier1_inbox_bell")).toBe(0);
  });
});
