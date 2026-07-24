import { afterEach, describe, expect, it, vi } from "vitest";

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("notification-badge-count-store", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("applies domain_badge authority and keeps last on fetch failure", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          ok: true,
          authority: "domain_badge",
          projectionVersionMs: 100,
          domainUnreadRooms: {
            general_direct: 2,
            group: 0,
            trade: 1,
            store_order: 0,
          },
          domainAppIcon: { messenger: 2, trade: 1, storeOrder: 0, missedCall: 0 },
          nonChatEventAttention: {
            tradeStatus: 0,
            orderStatus: 1,
            deliveryStatus: 0,
            communityActivity: 0,
            adminNotice: 0,
          },
          total: 4,
          chatMessage: 2,
          groupMessage: 0,
          tradeMessage: 1,
          tradeStatus: 0,
          orderStatus: 1,
          deliveryStatus: 0,
          communityActivity: 0,
          adminMarketingBanner: 0,
          adminNotice: 0,
          chat: 2,
          group: 0,
          trade: 1,
          store: 0,
          missedCall: 0,
        }),
      })
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    const unsubscribe = store.subscribeNotificationBadgeCount(() => {});
    await flush();
    await flush();

    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(4);

    store.requestNotificationBadgeCountResync("test_failure");
    await flush();
    await flush();

    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(4);
    unsubscribe();
  });

  it("rejects event-SUM-only payload without authority (no fallback)", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          ok: true,
          total: 99,
          chatMessage: 99,
          groupMessage: 0,
          tradeMessage: 0,
          tradeStatus: 0,
          orderStatus: 0,
          deliveryStatus: 0,
          communityActivity: 0,
          adminMarketingBanner: 0,
          adminNotice: 0,
          chat: 99,
          group: 0,
          trade: 0,
          store: 0,
          missedCall: 0,
        }),
      })
    );
    const store = await import("@/lib/notifications/notification-badge-count-store");
    store.resetNotificationBadgeCountStoreForTests();
    const unsubscribe = store.subscribeNotificationBadgeCount(() => {});
    await flush();
    await flush();
    expect(store.getNotificationBadgeCountSnapshot()).toBeNull();
    unsubscribe();
  });

  it("funnels patch through Bell projection without App Icon mirror", async () => {
    const store = await import("@/lib/notifications/notification-badge-count-store");
    const bell = await import("@/lib/chat-domain/projections/bell-badge-projection");
    const appIcon = await import("@/lib/chat-domain/projections/app-icon-badge-projection");
    store.resetNotificationBadgeCountStoreForTests();

    const next = {
      total: 5,
      chatMessage: 2,
      groupMessage: 0,
      tradeMessage: 1,
      tradeStatus: 0,
      orderStatus: 1,
      deliveryStatus: 0,
      communityActivity: 0,
      adminMarketingBanner: 0,
      adminNotice: 1,
      chat: 2,
      group: 0,
      trade: 1,
      store: 1,
      missedCall: 0,
    };
    store.patchNotificationBadgeCountSnapshot(next, "read_patch");

    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(5);
    expect(bell.getBellBadgeProjection()?.totalUnread).toBe(5);
    expect(bell.getBellBadgeProjection()?.source).toBe("read_patch");
    // Bell patch must not mirror App Icon
    expect(appIcon.getAppIconBadgeProjection()?.source).not.toBe("bell_mirror");
  });
});
