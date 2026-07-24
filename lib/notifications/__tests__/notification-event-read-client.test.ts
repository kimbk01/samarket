import { beforeEach, describe, expect, it, vi } from "vitest";

const resyncBadgesAfterNotificationEventsRead = vi.fn();
const applyCallLogsOrphanMissedReadFact = vi.fn();

vi.mock("@/lib/community-messenger/notifications/messenger-notification-contract", () => ({
  requestMessengerHubBadgeResync: vi.fn(),
}));

vi.mock("@/lib/notifications/client/notification-events-read-resync", () => ({
  resyncBadgesAfterNotificationEventsRead: (...args: unknown[]) =>
    resyncBadgesAfterNotificationEventsRead(...args),
  applyCallLogsOrphanMissedReadFact: (...args: unknown[]) =>
    applyCallLogsOrphanMissedReadFact(...args),
}));

vi.mock("@/lib/notifications/core/notification-logs", () => ({
  logNotifyOpen: vi.fn(),
}));

vi.mock("@/lib/http/run-single-flight", () => ({
  runSingleFlight: (_key: string, fn: () => Promise<boolean>) => fn(),
}));

import {
  postNotificationCallLogsMissedCallsRead,
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

  it("does not apply events categoryCounts as Bell; resyncs, and never orphan-fact on room read", async () => {
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
    // P0-3: 일반 room/thread read 는 orphan missed 를 감소시키지 않는다.
    expect(applyCallLogsOrphanMissedReadFact).not.toHaveBeenCalled();
  });

  it("resyncs after room-read without events SUM patch or orphan fact", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, cleared: 0, categoryCounts }),
    } as Response);

    const ok = await postNotificationRoomRead("room-2");

    expect(ok).toBe(true);
    expect(resyncBadgesAfterNotificationEventsRead).toHaveBeenCalledWith("room_read");
    expect(applyCallLogsOrphanMissedReadFact).not.toHaveBeenCalled();
  });

  it("resyncs when categoryCounts is missing; still no orphan fact on generic read", async () => {
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
    expect(applyCallLogsOrphanMissedReadFact).not.toHaveBeenCalled();
  });

  it("call_logs missed read applies orphan missed fact exactly once (missed-only path)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, cleared: 3 }),
    } as Response);

    const ok = await postNotificationCallLogsMissedCallsRead();

    expect(ok).toBe(true);
    expect(applyCallLogsOrphanMissedReadFact).toHaveBeenCalledTimes(1);
    expect(resyncBadgesAfterNotificationEventsRead).toHaveBeenCalledWith("call_logs_viewed");
  });
});
