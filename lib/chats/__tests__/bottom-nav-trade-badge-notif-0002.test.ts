import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";
import { resolveBottomNavTradeTabBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";

let eventsSnap: {
  tradeMessage?: number;
  tradeStatus?: number;
  trade?: number;
} | null = {
  tradeMessage: 3,
  tradeStatus: 5,
};

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  getNotificationBadgeCountSnapshot: () => eventsSnap,
}));

import { resolveBottomNavTabUnreadFromNotificationEvents } from "@/lib/chats/use-owner-hub-badge-total";

describe("bottom nav trade badge notif-0002", () => {
  beforeEach(() => {
    eventsSnap = { tradeMessage: 3, tradeStatus: 5 };
  });

  it("policy function always returns 0 for trade tab icon", () => {
    expect(resolveBottomNavTradeTabBadgeCount(OWNER_HUB_BADGE_EMPTY)).toBe(0);
  });

  it("events slice still reports trade counts for other surfaces", () => {
    expect(resolveBottomNavTabUnreadFromNotificationEvents("trade")).toBe(8);
  });

  it("useOwnerHubBadgeTabUnreadCount bypasses events override for trade icon", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/chats/use-owner-hub-badge-total.ts"),
      "utf8"
    );
    expect(src).toMatch(/if \(icon === "trade"\)/);
    expect(src).toMatch(/resolveBottomNavTradeTabBadgeCount\(getOwnerHubBadgeSnapshot\(\)\)/);
    const tradeGuard = src.indexOf('if (icon === "trade")');
    const fromEvents = src.indexOf("tabUnreadFromNotificationEvents(icon)");
    expect(tradeGuard).toBeGreaterThan(-1);
    expect(fromEvents).toBeGreaterThan(-1);
    expect(tradeGuard).toBeLessThan(fromEvents);
  });
});
