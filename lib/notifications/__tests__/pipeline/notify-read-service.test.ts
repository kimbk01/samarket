import { beforeEach, describe, expect, it, vi } from "vitest";

const markNotificationEventRead = vi.fn();
const markRoomNotificationEventsRead = vi.fn();
const markMissedCallEventsRead = vi.fn();
const markAllMissedCallEventsRead = vi.fn();
const markNotificationEventsReadByCategory = vi.fn();
const markNotificationEventsReadByThread = vi.fn();
const markOrderNotificationEventsRead = vi.fn();
const markCommunityPostNotificationEventsRead = vi.fn();
const markTradeStatusNotificationEventsReadByProductId = vi.fn();
const fetchDomainBadgeAuthorityPayload = vi.fn();
const invalidateNotificationBadgeCache = vi.fn();
const clearNotificationTargetsAfterRoomRead = vi.fn();
const clearNotificationTargetsAfterThreadRead = vi.fn();

vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  markNotificationEventRead: (...args: unknown[]) => markNotificationEventRead(...args),
  markRoomNotificationEventsRead: (...args: unknown[]) => markRoomNotificationEventsRead(...args),
  markMissedCallEventsRead: (...args: unknown[]) => markMissedCallEventsRead(...args),
  markAllMissedCallEventsRead: (...args: unknown[]) => markAllMissedCallEventsRead(...args),
  markNotificationEventsReadByCategory: (...args: unknown[]) =>
    markNotificationEventsReadByCategory(...args),
  markNotificationEventsReadByThread: (...args: unknown[]) =>
    markNotificationEventsReadByThread(...args),
  markOrderNotificationEventsRead: (...args: unknown[]) =>
    markOrderNotificationEventsRead(...args),
  markCommunityPostNotificationEventsRead: (...args: unknown[]) =>
    markCommunityPostNotificationEventsRead(...args),
  markTradeStatusNotificationEventsReadByProductId: (...args: unknown[]) =>
    markTradeStatusNotificationEventsReadByProductId(...args),
}));

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  fetchDomainBadgeAuthorityPayload: (...args: unknown[]) => fetchDomainBadgeAuthorityPayload(...args),
  invalidateNotificationBadgeCache: (...args: unknown[]) => invalidateNotificationBadgeCache(...args),
}));

vi.mock("@/lib/notifications/notification-target-read-bridge", () => ({
  clearNotificationTargetsAfterRoomRead: (...args: unknown[]) =>
    clearNotificationTargetsAfterRoomRead(...args),
  clearNotificationTargetsAfterThreadRead: (...args: unknown[]) =>
    clearNotificationTargetsAfterThreadRead(...args),
}));

import {
  markMissedCallsRead,
  markNotificationCategoryRead,
  markNotificationRead,
  markNotificationThreadRead,
  markOrderNotificationsRead,
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
    markNotificationEventsReadByCategory.mockResolvedValue(3);
    markNotificationEventsReadByThread.mockResolvedValue(4);
    markOrderNotificationEventsRead.mockResolvedValue(1);
    markCommunityPostNotificationEventsRead.mockResolvedValue(2);
    markTradeStatusNotificationEventsReadByProductId.mockResolvedValue(3);
    fetchDomainBadgeAuthorityPayload.mockResolvedValue({ total: 0 });
    clearNotificationTargetsAfterRoomRead.mockResolvedValue(undefined);
    clearNotificationTargetsAfterThreadRead.mockResolvedValue(undefined);
  });

  it("marks single notification read and refreshes badge", async () => {
    const ok = await markNotificationRead(sb, "user-1", "evt-1", { openedAt: true });
    expect(ok).toBe(true);
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("user-1");
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalled();
  });

  it("marks room events read when count > 0", async () => {
    const count = await markRoomRead(sb, "user-1", "room-1");
    expect(count).toBe(2);
    expect(clearNotificationTargetsAfterRoomRead).toHaveBeenCalledWith(sb, "user-1", "room-1");
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("user-1");
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalled();
  });

  it("refreshes badge after room read target clear even when events are already read", async () => {
    markRoomNotificationEventsRead.mockResolvedValueOnce(0);
    const count = await markRoomRead(sb, "user-1", "room-1");
    expect(count).toBe(0);
    expect(clearNotificationTargetsAfterRoomRead).toHaveBeenCalledWith(sb, "user-1", "room-1");
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("user-1");
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalled();
  });

  it("does not fail room read when target clear bridge fails", async () => {
    clearNotificationTargetsAfterRoomRead.mockRejectedValueOnce(new Error("target clear failed"));
    const count = await markRoomRead(sb, "user-1", "room-1");
    expect(count).toBe(2);
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalled();
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

  it("marks category read and refreshes badge immediately", async () => {
    const count = await markNotificationCategoryRead(sb, "user-1", "admin_notice");
    expect(count).toBe(3);
    expect(markNotificationEventsReadByCategory).toHaveBeenCalledWith(sb, "user-1", "admin_notice");
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("user-1");
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalled();
  });

  it("clears targets after thread read even when events are already read", async () => {
    markNotificationEventsReadByThread.mockResolvedValueOnce(0);
    const count = await markNotificationThreadRead(sb, "user-1", "room-1", {
      threadType: "chat_room",
      readReason: "chat_room_visible",
    });
    expect(count).toBe(0);
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalled();
    expect(clearNotificationTargetsAfterThreadRead).toHaveBeenCalledWith(sb, "user-1", {
      threadId: "room-1",
      threadType: "chat_room",
      readReason: "chat_room_visible",
    });
  });

  it("does not fail thread read when target clear bridge fails", async () => {
    clearNotificationTargetsAfterThreadRead.mockRejectedValueOnce(new Error("target clear failed"));
    const count = await markNotificationThreadRead(sb, "user-1", "room-1", {
      threadType: "chat_room",
      readReason: "chat_room_visible",
    });
    expect(count).toBe(4);
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalled();
  });

  it("marks thread read and refreshes badge immediately", async () => {
    const count = await markNotificationThreadRead(sb, "user-1", "room-1", {
      categories: ["chat_message"],
      threadType: "trade_room",
      readReason: "chat_room_visible",
    });
    expect(count).toBe(4);
    expect(markNotificationEventsReadByThread).toHaveBeenCalledWith(sb, "user-1", "room-1", {
      categories: ["chat_message"],
      threadType: "trade_room",
      readReason: "chat_room_visible",
    });
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("user-1");
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalled();
    expect(clearNotificationTargetsAfterThreadRead).toHaveBeenCalledWith(sb, "user-1", {
      threadId: "room-1",
      threadType: "trade_room",
      readReason: "chat_room_visible",
    });
  });

  it("marks order thread read via order repository path", async () => {
    const count = await markNotificationThreadRead(sb, "user-1", "order-1", {
      threadType: "order",
      readReason: "order_detail_opened",
    });
    expect(count).toBe(1);
    expect(markOrderNotificationEventsRead).toHaveBeenCalledWith(sb, "user-1", "order-1");
    expect(markNotificationEventsReadByThread).not.toHaveBeenCalled();
  });

  it("marks community post thread read via community repository path", async () => {
    const count = await markNotificationThreadRead(sb, "user-1", "post-1", {
      threadType: "community_post",
      readReason: "community_post_opened",
    });
    expect(count).toBe(2);
    expect(markCommunityPostNotificationEventsRead).toHaveBeenCalledWith(sb, "user-1", "post-1");
  });

  it("marks trade detail read via product id repository path", async () => {
    const count = await markNotificationThreadRead(sb, "user-1", "product-1", {
      threadType: "trade_room",
      readReason: "trade_detail_opened",
      categories: ["trade_status"],
    });
    expect(count).toBe(3);
    expect(markTradeStatusNotificationEventsReadByProductId).toHaveBeenCalledWith(
      sb,
      "user-1",
      "product-1"
    );
    expect(markNotificationEventsReadByThread).not.toHaveBeenCalled();
  });

  it("marks order notifications read and refreshes badge immediately", async () => {
    const count = await markOrderNotificationsRead(sb, "user-1", "order-1");
    expect(count).toBe(1);
    expect(markOrderNotificationEventsRead).toHaveBeenCalledWith(sb, "user-1", "order-1");
    expect(invalidateNotificationBadgeCache).toHaveBeenCalledWith("user-1");
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalled();
  });
});
