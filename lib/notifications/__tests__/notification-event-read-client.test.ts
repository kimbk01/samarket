import { beforeEach, describe, expect, it, vi } from "vitest";

const resyncBadgesAfterNotificationEventsRead = vi.fn();
const applyMissedCallNotificationReadOptimistic = vi.fn();

vi.mock("@/lib/community-messenger/notifications/messenger-notification-contract", () => ({
  requestMessengerHubBadgeResync: vi.fn(),
}));

vi.mock("@/lib/notifications/client/notification-events-read-resync", () => ({
  resyncBadgesAfterNotificationEventsRead: (...args: unknown[]) =>
    resyncBadgesAfterNotificationEventsRead(...args),
  applyMissedCallNotificationReadOptimistic: (...args: unknown[]) =>
    applyMissedCallNotificationReadOptimistic(...args),
}));

vi.mock("@/lib/notifications/core/notification-logs", () => ({
  logNotifyOpen: vi.fn(),
}));

vi.mock("@/lib/http/run-single-flight", () => ({
  runSingleFlight: (_key: string, fn: () => Promise<boolean>) => fn(),
}));

import {
  postNotificationRoomRead,
  postNotificationThreadRead,
} from "@/lib/notifications/client/notification-event-read-client";

const categoryCounts = {
  total: 2,
  chatMessage: 1,
  groupMessage: 0,
  tradeMessage: 0,
  tradeStatus: 0,
  orderStatus: 1,
  deliveryStatus: 0,
  communityActivity: 0,
  adminNotice: 0,
  missedCall: 0,
  chat: 1,
  group: 0,
  trade: 0,
  store: 1,
};

describe("notification-event-read-client read path (Domain Bell)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, cleared: 0 }),
      }))
    );
  });

  it("does not apply events categoryCounts as Bell; always resyncs", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, cleared: 1, categoryCounts }),
    } as Response);

    const ok = await postNotificationThreadRead("room-1", {
      threadType: "chat_room",
      readReason: "chat_room_visible",
    });

    expect(ok).toBe(true);
    expect(resyncBadgesAfterNotificationEventsRead).toHaveBeenCalledWith("room_read");
    expect(applyMissedCallNotificationReadOptimistic).toHaveBeenCalledWith(1);
  });

  it("resyncs after room-read without events SUM patch", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, cleared: 0, categoryCounts }),
    } as Response);

    const ok = await postNotificationRoomRead("room-2");

    expect(ok).toBe(true);
    expect(resyncBadgesAfterNotificationEventsRead).toHaveBeenCalledWith("room_read");
  });

  it("resyncs when categoryCounts is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, cleared: 2 }),
    } as Response);

    const ok = await postNotificationThreadRead("room-3", {
      threadType: "order",
      readReason: "order_detail_opened",
    });

    expect(ok).toBe(true);
    expect(resyncBadgesAfterNotificationEventsRead).toHaveBeenCalledWith("room_read");
    expect(applyMissedCallNotificationReadOptimistic).toHaveBeenCalledWith(2);
  });
});
