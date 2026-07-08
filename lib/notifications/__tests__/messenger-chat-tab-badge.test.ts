import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";

const hubListeners = new Set<() => void>();

let hubSnap: OwnerHubBadgeBreakdown = { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 3 };

vi.mock("@/lib/chats/owner-hub-badge-store", () => ({
  getOwnerHubBadgeSnapshot: () => hubSnap,
  subscribeOwnerHubBadge: (fn: () => void) => {
    hubListeners.add(fn);
    return () => hubListeners.delete(fn);
  },
}));

import {
  resolveMessengerChatTabBadgeCount,
  subscribeMessengerChatTabBadge,
} from "@/lib/notifications/messenger-chat-tab-badge";

describe("messenger-chat-tab-badge Rebuild (room count)", () => {
  beforeEach(() => {
    hubSnap = { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 3 };
    hubListeners.clear();
  });

  it("uses hub communityMessengerUnread room count (not event SUM)", () => {
    expect(resolveMessengerChatTabBadgeCount(false)).toBe(3);
  });

  it("does not collapse when hub room count is high", () => {
    hubSnap = { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 99 };
    expect(resolveMessengerChatTabBadgeCount(false)).toBe(99);
  });

  it("returns 0 when hub room count is 0", () => {
    hubSnap = { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 0 };
    expect(resolveMessengerChatTabBadgeCount(false)).toBe(0);
  });

  it("notifies only on hub store changes (room-count authority)", () => {
    const onChange = vi.fn();
    subscribeMessengerChatTabBadge(onChange);
    hubListeners.forEach((l) => l());
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
