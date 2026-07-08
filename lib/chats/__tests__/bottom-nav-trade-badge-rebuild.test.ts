import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

let eventsSnap: {
  tradeMessage?: number;
  tradeStatus?: number;
  trade?: number;
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

describe("bottom nav trade badge Rebuild", () => {
  beforeEach(() => {
    eventsSnap = {
      tradeMessage: 3,
      tradeStatus: 5,
      chatMessage: 10,
      groupMessage: 2,
    };
  });

  it("Trade tab shows trade_message + trade_status causes (not always 0)", () => {
    expect(resolveBottomNavTradeTabBadgeCount()).toBe(8);
  });

  it("events trade slice matches Trade tab authority", () => {
    expect(resolveBottomNavTabUnreadFromNotificationEvents("trade")).toBe(8);
  });

  it("Chat events slice is not used as Chat tab authority (returns null)", () => {
    expect(resolveBottomNavTabUnreadFromNotificationEvents("chat")).toBeNull();
  });

  it("lock: useOwnerHubBadgeTabUnreadCount routes chat via room count, trade via trade resolver", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/chats/use-owner-hub-badge-total.ts"),
      "utf8"
    );
    expect(src).toContain('if (icon === "chat")');
    expect(src).toContain("resolveMessengerChatTabBadgeCount");
    expect(src).toContain('if (icon === "trade")');
    expect(src).toContain("resolveBottomNavTradeTabBadgeCount");
    expect(src).not.toMatch(/chatMessage \?\? snap\.chat\) \+ \(snap\.groupMessage/);
  });

  it("lock: Trade badge resolver uses events causes (not constant zero)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/samarket-messenger-notification-regulations.ts"),
      "utf8"
    );
    expect(src).toContain("getNotificationBadgeCountSnapshot");
    expect(src).toContain("tradeMessage");
    expect(src).toContain("tradeStatus");
    expect(src).not.toMatch(
      /export function resolveBottomNavTradeTabBadgeCount\([^)]*\)\s*\{\s*return 0;\s*\}/
    );
  });
});
