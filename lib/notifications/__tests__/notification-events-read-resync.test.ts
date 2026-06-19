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

import {
  applyMissedCallNotificationReadOptimistic,
  resyncBadgesAfterNotificationEventsRead,
} from "@/lib/notifications/client/notification-events-read-resync";

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
});
