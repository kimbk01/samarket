import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";
import { resolveMessengerChatTabBadgeCount } from "@/lib/notifications/messenger-chat-tab-badge";
import { matchesGroupChatListKindFilter } from "@/lib/community-messenger/group/group-room-notification-policy";

/**
 * Contract: same room with N unread messages → BottomNav Chat = 1 room, row = N.
 * Chat tab must not use event message SUM.
 */
describe("chat room-count vs row-count contract", () => {
  it("BottomNav Chat counts unread rooms (hub), not message sum", () => {
    // One room with conceptually 5 unread messages → hub room count stays 1
    const hub = { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 1 };
    expect(resolveMessengerChatTabBadgeCount(false, hub)).toBe(1);
    const hubFiveRooms = { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 5 };
    expect(resolveMessengerChatTabBadgeCount(false, hubFiveRooms)).toBe(5);
  });

  it("messenger-chat-tab-badge has no events SUM overlay", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/messenger-chat-tab-badge.ts"),
      "utf8"
    );
    expect(src).not.toContain("chatMessage");
    expect(src).not.toContain("groupMessage");
    expect(src).not.toContain("getNotificationBadgeCountSnapshot");
    expect(src).toContain("resolveBottomNavMessengerTabBadgeForOwnerStore");
  });

  it("kind=all excludes trade and delivery from Chat list (row surface)", () => {
    expect(
      matchesGroupChatListKindFilter(
        { roomType: "direct", contextMeta: { kind: "trade" } as never, messengerDirectKey: "trade_pc:x" },
        "all"
      )
    ).toBe(false);
    expect(
      matchesGroupChatListKindFilter(
        {
          roomType: "direct",
          contextMeta: { kind: "delivery" } as never,
          messengerDirectKey: "store_order:o1",
        },
        "all"
      )
    ).toBe(false);
    expect(
      matchesGroupChatListKindFilter(
        { roomType: "direct", contextMeta: null, messengerDirectKey: "aaaa:bbbb" },
        "all"
      )
    ).toBe(true);
    expect(
      matchesGroupChatListKindFilter(
        { roomType: "private_group", contextMeta: null, messengerDirectKey: null },
        "all"
      )
    ).toBe(true);
  });
});
