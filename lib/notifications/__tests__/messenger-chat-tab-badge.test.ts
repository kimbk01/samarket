import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";

const hubListeners = new Set<() => void>();
const eventsListeners = new Set<() => void>();

let hubSnap: OwnerHubBadgeBreakdown = { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 3 };
let eventsSnap: { total: number; chat: number; group: number; trade: number; store: number; missedCall: number } | null =
  { total: 5, chat: 2, group: 1, trade: 1, store: 0, missedCall: 1 };

vi.mock("@/lib/chats/owner-hub-badge-store", () => ({
  getOwnerHubBadgeSnapshot: () => hubSnap,
  subscribeOwnerHubBadge: (fn: () => void) => {
    hubListeners.add(fn);
    return () => hubListeners.delete(fn);
  },
}));

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  getNotificationBadgeCountSnapshot: () => eventsSnap,
  subscribeNotificationBadgeCount: (fn: () => void) => {
    eventsListeners.add(fn);
    return () => eventsListeners.delete(fn);
  },
}));

import {
  resolveMessengerChatTabBadgeCount,
  subscribeMessengerChatTabBadge,
} from "@/lib/notifications/messenger-chat-tab-badge";

describe("messenger-chat-tab-badge", () => {
  beforeEach(() => {
    hubSnap = { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 3 };
    eventsSnap = { total: 5, chat: 2, group: 1, trade: 1, store: 0, missedCall: 1 };
    hubListeners.clear();
    eventsListeners.clear();
  });

  it("prefers notification_events total over hub communityMessengerUnread", () => {
    expect(resolveMessengerChatTabBadgeCount(false)).toBe(5);
  });

  it("falls back to hub when notification_events snapshot is null", () => {
    eventsSnap = null;
    expect(resolveMessengerChatTabBadgeCount(false)).toBe(3);
  });

  it("notifies when either hub or notification_events store changes", () => {
    const onChange = vi.fn();
    subscribeMessengerChatTabBadge(onChange);
    hubListeners.forEach((l) => l());
    eventsListeners.forEach((l) => l());
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
