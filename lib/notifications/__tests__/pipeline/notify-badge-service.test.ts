import { beforeEach, describe, expect, it, vi } from "vitest";

const countNotificationEventsBadge = vi.fn();

vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  countNotificationEventsBadge: (...args: unknown[]) => countNotificationEventsBadge(...args),
}));

import {
  fetchNotificationBadgeCount,
  invalidateNotificationBadgeCache,
  NOTIFICATION_BADGE_SERVER_CACHE_MS,
  peekNotificationBadgeCacheHit,
  resetNotificationBadgeCacheForTests,
} from "@/lib/notifications/pipeline/notify-badge-service";

const sb = {} as never;

const SAMPLE: Awaited<ReturnType<typeof countNotificationEventsBadge>> = {
  total: 17,
  chatMessage: 4,
  groupMessage: 2,
  tradeMessage: 0,
  tradeStatus: 0,
  orderStatus: 0,
  deliveryStatus: 0,
  communityActivity: 0,
  adminMarketingBanner: 0,
  adminNotice: 11,
  chat: 4,
  group: 2,
  trade: 0,
  store: 0,
  missedCall: 0,
};

describe("notify-badge-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNotificationBadgeCacheForTests();
    countNotificationEventsBadge.mockResolvedValue(SAMPLE);
  });

  it("returns cached value within TTL without second RPC", async () => {
    const first = await fetchNotificationBadgeCount(sb, "user-1");
    const second = await fetchNotificationBadgeCount(sb, "user-1");
    expect(first).toEqual(SAMPLE);
    expect(second).toEqual(SAMPLE);
    expect(countNotificationEventsBadge).toHaveBeenCalledTimes(1);
    expect(peekNotificationBadgeCacheHit("user-1")).toBe(true);
  });

  it("force bypasses cache and always hits RPC", async () => {
    await fetchNotificationBadgeCount(sb, "user-1");
    await fetchNotificationBadgeCount(sb, "user-1", { force: true });
    expect(countNotificationEventsBadge).toHaveBeenCalledTimes(2);
  });

  it("singleflight merges concurrent misses into one RPC", async () => {
    const [a, b] = await Promise.all([
      fetchNotificationBadgeCount(sb, "user-1"),
      fetchNotificationBadgeCount(sb, "user-1"),
    ]);
    expect(a).toEqual(SAMPLE);
    expect(b).toEqual(SAMPLE);
    expect(countNotificationEventsBadge).toHaveBeenCalledTimes(1);
  });

  it("invalidate clears cache so next fetch hits RPC again", async () => {
    await fetchNotificationBadgeCount(sb, "user-1");
    invalidateNotificationBadgeCache("user-1");
    expect(peekNotificationBadgeCacheHit("user-1")).toBe(false);
    await fetchNotificationBadgeCount(sb, "user-1");
    expect(countNotificationEventsBadge).toHaveBeenCalledTimes(2);
  });

  it("uses 12-20s server cache TTL window", () => {
    expect(NOTIFICATION_BADGE_SERVER_CACHE_MS).toBeGreaterThanOrEqual(12_000);
    expect(NOTIFICATION_BADGE_SERVER_CACHE_MS).toBeLessThanOrEqual(20_000);
  });
});
