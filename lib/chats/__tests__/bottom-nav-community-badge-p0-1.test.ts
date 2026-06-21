import { beforeEach, describe, expect, it, vi } from "vitest";

let eventsSnap: {
  communityActivity?: number;
  adminNotice?: number;
} | null = {
  communityActivity: 1,
  adminNotice: 2,
};

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  getNotificationBadgeCountSnapshot: () => eventsSnap,
}));

import { resolveBottomNavTabUnreadFromNotificationEvents } from "@/lib/chats/use-owner-hub-badge-total";

describe("bottom nav community badge P0.1", () => {
  beforeEach(() => {
    eventsSnap = { communityActivity: 1, adminNotice: 2 };
  });

  it("counts only community_activity on community tab (excludes admin_notice)", () => {
    expect(resolveBottomNavTabUnreadFromNotificationEvents("community")).toBe(1);
  });

  it("returns null when notification_events snapshot is absent", () => {
    eventsSnap = null;
    expect(resolveBottomNavTabUnreadFromNotificationEvents("community")).toBeNull();
  });
});
