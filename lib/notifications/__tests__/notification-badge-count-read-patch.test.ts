import { beforeEach, describe, expect, it } from "vitest";
import {
  applyNotificationBadgeCountFromReadResponse,
  getNotificationBadgeCountSnapshot,
  normalizeNotificationBadgeCountPayload,
  resetNotificationBadgeCountStoreForTests,
} from "@/lib/notifications/notification-badge-count-store";

describe("notification-badge-count read patch", () => {
  beforeEach(() => {
    resetNotificationBadgeCountStoreForTests();
  });

  it("normalizes read-thread categoryCounts payload", () => {
    const normalized = normalizeNotificationBadgeCountPayload({
      total: 5,
      chatMessage: 2,
      groupMessage: 1,
      communityActivity: 2,
      missedCall: 0,
    });
    expect(normalized).toMatchObject({
      total: 5,
      chatMessage: 2,
      groupMessage: 1,
      communityActivity: 2,
      missedCall: 0,
    });
  });

  it("applyNotificationBadgeCountFromReadResponse updates snapshot", () => {
    const applied = applyNotificationBadgeCountFromReadResponse({
      total: 3,
      orderStatus: 2,
      communityActivity: 1,
      missedCall: 0,
      chat: 0,
      group: 0,
      trade: 0,
      store: 2,
    });
    expect(applied).toBe(true);
    expect(getNotificationBadgeCountSnapshot()).toMatchObject({
      total: 3,
      orderStatus: 2,
      communityActivity: 1,
    });
  });
});
