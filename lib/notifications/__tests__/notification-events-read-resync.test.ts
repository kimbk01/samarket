import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMessengerHubBadgeResync = vi.fn();

vi.mock("@/lib/community-messenger/notifications/messenger-notification-contract", () => ({
  requestMessengerHubBadgeResync: (...args: unknown[]) => requestMessengerHubBadgeResync(...args),
}));

let snap: {
  total: number;
  chat: number;
  group: number;
  trade: number;
  store: number;
  missedCall: number;
} | null = {
  total: 3,
  chat: 1,
  group: 1,
  trade: 0,
  store: 0,
  missedCall: 1,
};

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  getNotificationBadgeCountSnapshot: () => snap,
  patchNotificationBadgeCountSnapshot: (next: typeof snap) => {
    snap = next;
  },
}));

vi.mock("@/lib/notifications/tier1-admin-notice-bell-supplement", () => ({
  clearTier1AdminNoticeBellSupplementOptimistic: vi.fn(() => true),
}));

import {
  applyMissedCallNotificationReadOptimistic,
  applyTier1InboxMarkAllReadOptimistic,
  resyncBadgesAfterNotificationEventsRead,
} from "@/lib/notifications/client/notification-events-read-resync";
import { clearTier1AdminNoticeBellSupplementOptimistic } from "@/lib/notifications/tier1-admin-notice-bell-supplement";

describe("notification-events-read-resync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snap = { total: 3, chat: 1, group: 1, trade: 0, store: 0, missedCall: 1 };
  });

  it("resyncs through messenger hub badge entry only", () => {
    resyncBadgesAfterNotificationEventsRead("call_logs_viewed");
    expect(requestMessengerHubBadgeResync).toHaveBeenCalledTimes(1);
    expect(requestMessengerHubBadgeResync).toHaveBeenCalledWith("call_logs_viewed");
  });

  it("optimistically reduces missedCall and total before server fetch", () => {
    applyMissedCallNotificationReadOptimistic(1);
    expect(snap).toEqual({
      total: 2,
      chat: 1,
      group: 1,
      trade: 0,
      store: 0,
      missedCall: 0,
    });
  });

  it("skips optimistic patch when cleared is zero", () => {
    const before = snap;
    applyMissedCallNotificationReadOptimistic(0);
    expect(snap).toBe(before);
  });

  it("applyTier1InboxMarkAllReadOptimistic clears admin notice supplement", () => {
    applyTier1InboxMarkAllReadOptimistic();
    expect(clearTier1AdminNoticeBellSupplementOptimistic).toHaveBeenCalledTimes(1);
  });
});
