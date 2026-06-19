import { beforeEach, describe, expect, it, vi } from "vitest";

const markNotificationEventRead = vi.fn();
const markRoomNotificationEventsRead = vi.fn();
const markMissedCallEventsRead = vi.fn();
const markAllMissedCallEventsRead = vi.fn();
const fetchNotificationBadgeCount = vi.fn();
const invalidateNotificationBadgeCache = vi.fn();

vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  markNotificationEventRead: (...args: unknown[]) => markNotificationEventRead(...args),
  markRoomNotificationEventsRead: (...args: unknown[]) => markRoomNotificationEventsRead(...args),
  markMissedCallEventsRead: (...args: unknown[]) => markMissedCallEventsRead(...args),
  markAllMissedCallEventsRead: (...args: unknown[]) => markAllMissedCallEventsRead(...args),
}));

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  fetchNotificationBadgeCount: (...args: unknown[]) => fetchNotificationBadgeCount(...args),
  invalidateNotificationBadgeCache: (...args: unknown[]) => invalidateNotificationBadgeCache(...args),
}));

import {
  markMissedCallsRead,
  markNotificationRead,
  markRoomRead,
} from "@/lib/notifications/pipeline/notify-read-service";

const sb = {} as never;

describe("notify-read-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markNotificationEventRead.mockResolvedValue(true);
    markRoomNotificationEventsRead.mockResolvedValue(2);
    markMissedCallEventsRead.mockResolvedValue(1);
    markAllMissedCallEventsRead.mockResolvedValue(2);
    fetchNotificationBadgeCount.mockResolvedValue({ total: 0 });
  });

  it("marks single notification read and refreshes badge", async () => {
    const ok = await markNotificationRead(sb, "user-1", "evt-1", { openedAt: true });
    expect(ok).toBe(true);
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("user-1");
    expect(fetchNotificationBadgeCount).toHaveBeenCalled();
  });

  it("marks room events read when count > 0", async () => {
    const count = await markRoomRead(sb, "user-1", "room-1");
    expect(count).toBe(2);
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("user-1");
  });

  it("marks missed call events read", async () => {
    const count = await markMissedCallsRead(sb, "user-1", { callSessionId: "sess-1" });
    expect(count).toBe(1);
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("user-1");
  });

  it("marks all missed calls read on call_logs scope", async () => {
    const count = await markMissedCallsRead(sb, "user-1", { scope: "call_logs" });
    expect(count).toBe(2);
    expect(markAllMissedCallEventsRead).toHaveBeenCalledWith(sb, "user-1");
    expect(markMissedCallEventsRead).not.toHaveBeenCalled();
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("user-1");
  });
});
