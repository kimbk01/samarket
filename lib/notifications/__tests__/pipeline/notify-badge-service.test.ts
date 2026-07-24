import { beforeEach, describe, expect, it, vi } from "vitest";

const buildDomainBadgeAuthorityHttpPayload = vi.fn();

vi.mock("@/lib/notifications/pipeline/build-domain-badge-authority-http", () => ({
  buildDomainBadgeAuthorityHttpPayload: (...args: unknown[]) =>
    buildDomainBadgeAuthorityHttpPayload(...args),
}));

import {
  fetchDomainBadgeAuthorityPayload,
  invalidateNotificationBadgeCache,
  NOTIFICATION_BADGE_SERVER_CACHE_MS,
  peekNotificationBadgeCacheHit,
  resetNotificationBadgeCacheForTests,
} from "@/lib/notifications/pipeline/notify-badge-service";

const sb = {} as never;

const SAMPLE_EVENTS = {
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

const SAMPLE_DOMAIN = {
  ok: true as const,
  authority: "domain_badge" as const,
  projectionVersionMs: 1,
  projection: {
    bellTotal: 5,
    appIconTotal: 3,
    bottomChatTotal: 2,
    domainUnread: { general_direct: 1, group: 1, trade: 1, store_order: 0 },
    orphanMissedCallCount: 0,
    nonChatNotificationCount: 2,
  },
  domainUnreadRooms: { general_direct: 1, group: 1, trade: 1, store_order: 0 },
  domainAppIcon: { messenger: 2, trade: 1, storeOrder: 0, missedCall: 0 },
  storeOrderBuyerDeliveryUnread: 0,
  storeOrderOwnerChatUnread: 0,
  unreadApprovedNotificationEvents: 5,
  nonChatEventAttention: {
    tradeStatus: 0,
    orderStatus: 0,
    deliveryStatus: 0,
    communityActivity: 0,
    adminNotice: 2,
  },
  missedCallByRoom: {},
  total: 5,
  chatMessage: 1,
  groupMessage: 1,
  tradeMessage: 1,
  tradeStatus: 0,
  orderStatus: 0,
  deliveryStatus: 0,
  communityActivity: 0,
  adminMarketingBanner: 0,
  adminNotice: 2,
  chat: 1,
  group: 1,
  trade: 1,
  store: 0,
  missedCall: 0,
  categoryCounts: SAMPLE_EVENTS,
};

describe("notify-badge-service (Domain authority)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNotificationBadgeCacheForTests();
    buildDomainBadgeAuthorityHttpPayload.mockResolvedValue(SAMPLE_DOMAIN);
  });

  it("caches domain authority within TTL", async () => {
    const first = await fetchDomainBadgeAuthorityPayload(sb, "user-1");
    const second = await fetchDomainBadgeAuthorityPayload(sb, "user-1");
    expect(first).toEqual(SAMPLE_DOMAIN);
    expect(second).toEqual(SAMPLE_DOMAIN);
    expect(buildDomainBadgeAuthorityHttpPayload).toHaveBeenCalledTimes(1);
    expect(peekNotificationBadgeCacheHit("user-1")).toBe(true);
  });

  it("force bypasses domain cache", async () => {
    await fetchDomainBadgeAuthorityPayload(sb, "user-1");
    await fetchDomainBadgeAuthorityPayload(sb, "user-1", { force: true });
    expect(buildDomainBadgeAuthorityHttpPayload).toHaveBeenCalledTimes(2);
  });

  it("singleflight merges concurrent domain misses", async () => {
    const [a, b] = await Promise.all([
      fetchDomainBadgeAuthorityPayload(sb, "user-1"),
      fetchDomainBadgeAuthorityPayload(sb, "user-1"),
    ]);
    expect(a).toEqual(SAMPLE_DOMAIN);
    expect(b).toEqual(SAMPLE_DOMAIN);
    expect(buildDomainBadgeAuthorityHttpPayload).toHaveBeenCalledTimes(1);
  });

  it("invalidate clears domain cache", async () => {
    await fetchDomainBadgeAuthorityPayload(sb, "user-1");
    invalidateNotificationBadgeCache("user-1");
    expect(peekNotificationBadgeCacheHit("user-1")).toBe(false);
    await fetchDomainBadgeAuthorityPayload(sb, "user-1");
    expect(buildDomainBadgeAuthorityHttpPayload).toHaveBeenCalledTimes(2);
  });

  it("uses 12-20s server cache TTL window", () => {
    expect(NOTIFICATION_BADGE_SERVER_CACHE_MS).toBeGreaterThanOrEqual(12_000);
    expect(NOTIFICATION_BADGE_SERVER_CACHE_MS).toBeLessThanOrEqual(20_000);
  });
});
