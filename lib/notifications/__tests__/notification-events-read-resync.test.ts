import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMessengerHubBadgeResync = vi.fn();
const requestNotificationBadgeCountResync = vi.fn();
const applyNotificationBadgeProjection = vi.fn();

vi.mock("@/lib/community-messenger/notifications/messenger-notification-contract", () => ({
  requestMessengerHubBadgeResync: (...args: unknown[]) => requestMessengerHubBadgeResync(...args),
}));

vi.mock("@/lib/chats/owner-hub-badge-store", () => ({
  getOwnerHubBadgeSnapshot: () => ({
    chatUnread: 0,
    communityMessengerUnread: 0,
    philifeChatUnread: 0,
    socialChatUnread: 0,
    storeOrderChatUnread: 0,
    storeOrderOwnerUnreadRooms: 0,
    orderAttention: 0,
    inquiryAttention: 0,
    ownerReviewAttention: 0,
    storesTabAttention: 0,
    buyerOrderAttention: 0,
    storeDeepLink: null,
    total: 0,
  }),
}));

let snap: {
  total: number;
  chat: number;
  chatMessage?: number;
  group: number;
  groupMessage?: number;
  trade: number;
  tradeMessage?: number;
  store: number;
  missedCall: number;
  adminNotice?: number;
  tradeStatus?: number;
  orderStatus?: number;
  deliveryStatus?: number;
  communityActivity?: number;
} | null = {
  total: 5,
  chat: 1,
  chatMessage: 1,
  group: 1,
  groupMessage: 1,
  trade: 0,
  tradeMessage: 0,
  store: 0,
  missedCall: 1,
  adminNotice: 2,
};

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  getNotificationBadgeCountSnapshot: () => snap,
  patchNotificationBadgeCountSnapshot: vi.fn(),
  requestNotificationBadgeCountResync: (...args: unknown[]) =>
    requestNotificationBadgeCountResync(...args),
}));

vi.mock("@/lib/messenger/contracts/domain-badge-authority-product-bridge", () => ({
  applyNotificationBadgeProjection: (...args: unknown[]) =>
    applyNotificationBadgeProjection(...args),
}));

import {
  applyMissedCallNotificationReadOptimistic,
  applyTier1InboxMarkAllReadOptimistic,
  resyncBadgesAfterNotificationEventsRead,
} from "@/lib/notifications/client/notification-events-read-resync";

describe("notification-events-read-resync (Bell Contract B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snap = {
      total: 5,
      chat: 1,
      chatMessage: 1,
      group: 1,
      groupMessage: 1,
      trade: 0,
      tradeMessage: 0,
      store: 0,
      missedCall: 1,
      adminNotice: 2,
    };
  });

  it("resyncs hub room count and Domain badge-count authority", () => {
    resyncBadgesAfterNotificationEventsRead("call_logs_viewed");
    expect(requestMessengerHubBadgeResync).toHaveBeenCalledTimes(1);
    expect(requestMessengerHubBadgeResync).toHaveBeenCalledWith("call_logs_viewed");
    expect(requestNotificationBadgeCountResync).toHaveBeenCalledTimes(1);
    expect(requestNotificationBadgeCountResync).toHaveBeenCalledWith("call_logs_viewed");
  });

  it("optimistically rebuilds projection with reduced orphan missedCall (Bell Contract B)", () => {
    applyMissedCallNotificationReadOptimistic(1);
    expect(applyNotificationBadgeProjection).toHaveBeenCalledTimes(1);
    const projection = applyNotificationBadgeProjection.mock.calls[0]?.[0] as {
      bellTotal: number;
      bell: { missedCall: number };
      appIcon: { missedCall: number };
    };
    expect(projection.bell.missedCall).toBe(0);
    expect(projection.appIcon.missedCall).toBe(0);
    // Events: chat(1)+group(1)+admin(2)+missed(0) = 4
    expect(projection.bellTotal).toBe(4);
  });

  it("skips optimistic patch when cleared is zero", () => {
    applyMissedCallNotificationReadOptimistic(0);
    expect(applyNotificationBadgeProjection).not.toHaveBeenCalled();
    expect(requestNotificationBadgeCountResync).not.toHaveBeenCalled();
  });

  it("applyTier1InboxMarkAllReadOptimistic zeros adminNotice via Builder", () => {
    applyTier1InboxMarkAllReadOptimistic();
    expect(applyNotificationBadgeProjection).toHaveBeenCalledTimes(1);
    const projection = applyNotificationBadgeProjection.mock.calls[0]?.[0] as {
      bellTotal: number;
      bell: { adminNotice: number; missedCall: number };
    };
    expect(projection.bell.adminNotice).toBe(0);
    // Events: chat(1)+group(1)+missed(1)+admin(0) = 3
    expect(projection.bellTotal).toBe(3);
    expect(projection.bell.missedCall).toBe(1);
  });

  it("resyncs badge-count when snap missing for admin optimistic", () => {
    snap = null;
    applyTier1InboxMarkAllReadOptimistic();
    expect(applyNotificationBadgeProjection).not.toHaveBeenCalled();
    expect(requestNotificationBadgeCountResync).toHaveBeenCalledWith("optimistic_admin_missing_snap");
  });
});
