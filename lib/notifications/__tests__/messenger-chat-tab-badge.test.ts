import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMessengerBottomChatUnreadForTest,
  applyMessengerBottomChatUnread,
  getMessengerBottomChatUnreadCount,
  subscribeMessengerBottomChatUnread,
} from "@/lib/notifications/messenger-bottom-chat-unread-projection";
import {
  resolveMessengerChatTabBadgeCount,
  subscribeMessengerChatTabBadge,
} from "@/lib/notifications/messenger-chat-tab-badge";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";
import fs from "node:fs";
import path from "node:path";

describe("messenger-chat-tab-badge — Messenger projection input", () => {
  beforeEach(() => {
    __resetMessengerBottomChatUnreadForTest();
  });

  it("uses projection communityMessengerUnread room count (not event SUM)", () => {
    applyMessengerBottomChatUnread(3);
    expect(resolveMessengerChatTabBadgeCount(false)).toBe(3);
  });

  it("does not collapse when room count is high", () => {
    applyMessengerBottomChatUnread(99);
    expect(resolveMessengerChatTabBadgeCount()).toBe(99);
  });

  it("returns 0 when room count is 0", () => {
    applyMessengerBottomChatUnread(0);
    expect(resolveMessengerChatTabBadgeCount()).toBe(0);
  });

  it("optional hub arg keeps formula checks without Owner fields", () => {
    const hub = {
      ...OWNER_HUB_BADGE_EMPTY,
      communityMessengerUnread: 4,
      storeOrderOwnerUnreadRooms: 9,
      chatUnread: 7,
    };
    expect(resolveMessengerChatTabBadgeCount(false, hub)).toBe(4);
  });

  it("notifies only on Messenger projection changes", () => {
    const onChange = vi.fn();
    subscribeMessengerChatTabBadge(onChange);
    applyMessengerBottomChatUnread(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    applyMessengerBottomChatUnread(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    applyMessengerBottomChatUnread(2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("same value re-apply does not notify subscribers", () => {
    const onChange = vi.fn();
    subscribeMessengerBottomChatUnread(onChange);
    expect(applyMessengerBottomChatUnread(5)).toBe(true);
    expect(applyMessengerBottomChatUnread(5)).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getMessengerBottomChatUnreadCount()).toBe(5);
  });

  it("Owner hub non-CM fields do not notify Bottom Chat subscribers", async () => {
    const { __resetOwnerHubBadgeStoreForTest, applyDomainAuthorityHubBadgeOptimistic } =
      await import("@/lib/chats/owner-hub-badge-store");
    __resetOwnerHubBadgeStoreForTest();
    applyMessengerBottomChatUnread(2);
    const onChange = vi.fn();
    subscribeMessengerChatTabBadge(onChange);
    onChange.mockClear();

    applyDomainAuthorityHubBadgeOptimistic({
      communityMessengerUnread: 2,
      tradeUnread: 9,
      storeOrderOwnerUnreadRooms: 4,
      buyerOrderAttention: 3,
    });
    expect(onChange).toHaveBeenCalledTimes(0);
    expect(resolveMessengerChatTabBadgeCount()).toBe(2);

    applyDomainAuthorityHubBadgeOptimistic({
      communityMessengerUnread: 3,
      tradeUnread: 9,
      storeOrderOwnerUnreadRooms: 4,
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(resolveMessengerChatTabBadgeCount()).toBe(3);
  });
});
