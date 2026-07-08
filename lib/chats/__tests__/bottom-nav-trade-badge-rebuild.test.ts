import { beforeEach, describe, expect, it, vi } from "vitest";

let eventsSnap: {
  tradeMessage?: number;
  tradeStatus?: number;
  chatMessage?: number;
  groupMessage?: number;
} | null = {
  tradeMessage: 3,
  tradeStatus: 5,
  chatMessage: 10,
  groupMessage: 2,
};

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  getNotificationBadgeCountSnapshot: () => eventsSnap,
}));

import { resolveBottomNavTradeTabBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { resolveBottomNavTabUnreadFromNotificationEvents } from "@/lib/chats/use-owner-hub-badge-total";

describe("bottom nav trade badge Legacy", () => {
  beforeEach(() => {
    eventsSnap = {
      tradeMessage: 3,
      tradeStatus: 5,
      chatMessage: 10,
      groupMessage: 2,
    };
  });

  it("Trade tab badge stays 0 even when trade events are unread", () => {
    expect(resolveBottomNavTradeTabBadgeCount()).toBe(0);
  });

  it("Trade events slice is not wired to BottomNav (returns null)", () => {
    expect(resolveBottomNavTabUnreadFromNotificationEvents("trade")).toBeNull();
  });

  it("Chat events slice is not used as Chat tab authority (returns null)", () => {
    expect(resolveBottomNavTabUnreadFromNotificationEvents("chat")).toBeNull();
  });
});
