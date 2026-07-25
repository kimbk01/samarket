import { beforeEach, describe, expect, it, vi } from "vitest";

const resyncBadgesAfterNotificationEventsRead = vi.fn();
const applyCallLogsOrphanMissedReadFact = vi.fn();
const applyDomainBadgeAuthorityFromReadAck = vi.fn();
const requestMessengerHubBadgeResync = vi.fn();

vi.mock("@/lib/community-messenger/notifications/messenger-notification-contract", () => ({
  requestMessengerHubBadgeResync: (...args: unknown[]) => requestMessengerHubBadgeResync(...args),
}));

vi.mock("@/lib/notifications/client/notification-events-read-resync", () => ({
  resyncBadgesAfterNotificationEventsRead: (...args: unknown[]) =>
    resyncBadgesAfterNotificationEventsRead(...args),
  applyCallLogsOrphanMissedReadFact: (...args: unknown[]) =>
    applyCallLogsOrphanMissedReadFact(...args),
  applyDomainBadgeAuthorityFromReadAck: (...args: unknown[]) =>
    applyDomainBadgeAuthorityFromReadAck(...args),
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

const domainAck = {
  ok: true,
  cleared: 1,
  authority: "domain_badge",
  badgeGeneration: 1_700_000_000_000,
  projectionVersionMs: 1_700_000_000_000,
  domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 0 },
  domainAppIcon: { messenger: 0, trade: 0, storeOrder: 0, missedCall: 0 },
  categoryCounts: {
    total: 0,
    chatMessage: 0,
    groupMessage: 0,
    tradeMessage: 0,
    tradeStatus: 0,
    orderStatus: 0,
    deliveryStatus: 0,
    communityActivity: 0,
    adminNotice: 0,
    missedCall: 0,
    chat: 0,
    group: 0,
    trade: 0,
    store: 0,
  },
};

describe("notification-event-read-client read path (Domain Bell)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyDomainBadgeAuthorityFromReadAck.mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, cleared: 0 }),
      }))
    );
  });

  it("falls back to resync when ACK has no Domain snapshot", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, cleared: 1, categoryCounts: domainAck.categoryCounts }),
    } as Response);

    const ok = await postNotificationThreadRead("room-1", {
      threadType: "chat_room",
      readReason: "chat_room_visible",
    });

    expect(ok).toBe(true);
    expect(applyDomainBadgeAuthorityFromReadAck).toHaveBeenCalled();
    expect(resyncBadgesAfterNotificationEventsRead).toHaveBeenCalledWith("room_read");
    expect(requestMessengerHubBadgeResync).not.toHaveBeenCalled();
    expect(applyCallLogsOrphanMissedReadFact).not.toHaveBeenCalled();
  });

  it("P3-a: ACK Domain snapshot applies once and skips badge-count fresh GET", async () => {
    applyDomainBadgeAuthorityFromReadAck.mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => domainAck,
    } as Response);

    const ok = await postNotificationRoomRead("room-2");

    expect(ok).toBe(true);
    expect(applyDomainBadgeAuthorityFromReadAck).toHaveBeenCalledTimes(1);
    expect(resyncBadgesAfterNotificationEventsRead).not.toHaveBeenCalled();
    expect(requestMessengerHubBadgeResync).toHaveBeenCalledWith("room_read", {
      skipBadgeCount: true,
    });
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

  it("call_logs missed read applies orphan missed fact; ACK apply skips fresh GET", async () => {
    applyDomainBadgeAuthorityFromReadAck.mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...domainAck, cleared: 3 }),
    } as Response);

    const ok = await postNotificationCallLogsMissedCallsRead();

    expect(ok).toBe(true);
    expect(applyCallLogsOrphanMissedReadFact).toHaveBeenCalledTimes(1);
    expect(resyncBadgesAfterNotificationEventsRead).not.toHaveBeenCalled();
    expect(requestMessengerHubBadgeResync).toHaveBeenCalledWith("call_logs_viewed", {
      skipBadgeCount: true,
    });
  });
});
