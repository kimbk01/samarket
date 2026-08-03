import { describe, expect, it, vi } from "vitest";
import {
  aggregateMemberAMarkAllUpdated,
  markMemberANotificationsAllRead,
} from "@/lib/notifications/inbox-read-bridge";

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  invalidateNotificationBadgeCache: vi.fn(),
}));

vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({
  invalidateNotificationUnreadCountCache: vi.fn(),
}));

describe("Gate3 Step4 member A mark-all (canonical only)", () => {
  it("aggregates event updates; legacy always 0", () => {
    expect(aggregateMemberAMarkAllUpdated(0, 3)).toEqual({
      legacyUpdated: 0,
      eventUpdated: 3,
      updated: 3,
    });
    expect(aggregateMemberAMarkAllUpdated(2, 3)).toEqual({
      legacyUpdated: 2,
      eventUpdated: 3,
      updated: 5,
    });
  });

  it("does not touch legacy notifications table — only markEvents", async () => {
    const markEvents = vi.fn().mockResolvedValue(3);
    const from = vi.fn(() => {
      throw new Error("legacy notifications must not be queried");
    });
    const sb = { from };

    const result = await markMemberANotificationsAllRead(sb as never, "user-1", {
      markEvents,
    });
    expect(from).not.toHaveBeenCalled();
    expect(markEvents).toHaveBeenCalledTimes(1);
    expect(markEvents).toHaveBeenCalledWith(sb, "user-1");
    expect(result).toEqual({
      legacyUpdated: 0,
      eventUpdated: 3,
      updated: 3,
    });
  });

  it("second mark-all with empty canonical set is idempotent updated 0", async () => {
    const markEvents = vi.fn().mockResolvedValue(0);
    const sb = { from: vi.fn() };
    const first = await markMemberANotificationsAllRead(sb as never, "user-1", { markEvents });
    const second = await markMemberANotificationsAllRead(sb as never, "user-1", { markEvents });
    expect(first).toEqual({ legacyUpdated: 0, eventUpdated: 0, updated: 0 });
    expect(second).toEqual({ legacyUpdated: 0, eventUpdated: 0, updated: 0 });
    expect(markEvents).toHaveBeenCalledTimes(2);
  });
});
