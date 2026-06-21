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

  it("keeps the last notification_events snapshot when badge fetch fails", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { visibilityState: "visible" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          ok: true,
          total: 4,
          chatMessage: 2,
          groupMessage: 0,
          tradeMessage: 1,
          tradeStatus: 0,
          orderStatus: 1,
          deliveryStatus: 0,
          communityActivity: 0,
          adminMarketingBanner: 9,
          adminNotice: 0,
          chat: 2,
          group: 0,
          trade: 1,
          store: 1,
          missedCall: 0,
        }),
      })
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const store = await import("@/lib/notifications/notification-badge-count-store");
    const unsubscribe = store.subscribeNotificationBadgeCount(() => {});
    await flush();

    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(4);

    store.requestNotificationBadgeCountResync("test_failure");
    await flush();

    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(4);
    unsubscribe();
  });
});
