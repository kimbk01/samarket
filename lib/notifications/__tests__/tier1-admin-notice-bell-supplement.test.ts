import { beforeEach, describe, expect, it, vi } from "vitest";

let eventsSnap: { adminNotice?: number; total?: number } | null = { adminNotice: 2, total: 13 };

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  getNotificationBadgeCountSnapshot: () => eventsSnap,
  patchNotificationBadgeCountSnapshot: (next: typeof eventsSnap) => {
    eventsSnap = next;
  },
}));

import { resolveTier1AdminNoticeBellSupplement, clearTier1AdminNoticeBellSupplementOptimistic } from "@/lib/notifications/tier1-admin-notice-bell-supplement";

describe("tier1 admin notice bell supplement", () => {
  beforeEach(() => {
    eventsSnap = { adminNotice: 2, total: 13 };
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

  it("clears adminNotice supplement optimistically for tier1 mark all read", () => {
    expect(clearTier1AdminNoticeBellSupplementOptimistic()).toBe(true);
    expect(eventsSnap).toEqual({ adminNotice: 0, total: 11 });
    expect(resolveTier1AdminNoticeBellSupplement("tier1_inbox_bell")).toBe(0);
  });
});
