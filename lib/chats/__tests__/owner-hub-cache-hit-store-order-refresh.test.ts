import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OwnerHubBadgePayload } from "@/lib/chats/owner-hub-badge-cache";
import {
  overlayFreshOwnerStoreOrderChatUnread,
  withFreshOwnerStoreOrderChatUnreadOnCacheHit,
} from "@/lib/chats/refresh-owner-hub-store-order-chat-unread-on-cache-hit";
import {
  getCachedOwnerHubBadge,
  invalidateOwnerHubBadgeCache,
  OWNER_HUB_BADGE_TTL_MS,
} from "@/lib/chats/owner-hub-badge-cache";

function basePayload(overrides: Partial<OwnerHubBadgePayload> = {}): OwnerHubBadgePayload {
  return {
    ok: true,
    total: 10,
    chatUnread: 1,
    communityMessengerUnread: 2,
    philifeChatUnread: 0,
    socialChatUnread: 3,
    storeOrderChatUnread: 6,
    orderAttention: 4,
    inquiryAttention: 0,
    ownerReviewAttention: 0,
    buyerOrderAttention: 0,
    storesTabAttention: 0,
    storeDeepLink: "/community-messenger?tab=order",
    ...overrides,
  };
}

describe("overlayFreshOwnerStoreOrderChatUnread", () => {
  it("replaces only storeOrderChatUnread; keeps other cached fields", () => {
    const cached = basePayload({ storeOrderChatUnread: 6, orderAttention: 9, total: 42 });
    const out = overlayFreshOwnerStoreOrderChatUnread(cached, 5);
    expect(out.storeOrderChatUnread).toBe(5);
    expect(out.orderAttention).toBe(9);
    expect(out.total).toBe(42);
    expect(out.communityMessengerUnread).toBe(2);
    expect(out.storeDeepLink).toBe(cached.storeDeepLink);
    expect(cached.storeOrderChatUnread).toBe(6);
  });

  it("SQL sum 12 / room count 5 → response 5", () => {
    expect(overlayFreshOwnerStoreOrderChatUnread(basePayload({ storeOrderChatUnread: 12 }), 5).storeOrderChatUnread).toBe(
      5
    );
  });

  it("cache HIT stale 6 + fresh 6 → 6", () => {
    expect(overlayFreshOwnerStoreOrderChatUnread(basePayload({ storeOrderChatUnread: 6 }), 6).storeOrderChatUnread).toBe(
      6
    );
  });
});

describe("getCachedOwnerHubBadge refresh on HIT", () => {
  const userId = "owner-cache-hit-user";

  beforeEach(() => {
    invalidateOwnerHubBadgeCache(userId);
  });

  it("MISS stores payload; HIT refreshes storeOrderChatUnread only", async () => {
    const miss = await getCachedOwnerHubBadge(userId, async () =>
      basePayload({ storeOrderChatUnread: 5, orderAttention: 7 })
    );
    expect(miss.storeOrderChatUnread).toBe(5);

    const hit = await getCachedOwnerHubBadge(
      userId,
      async () => {
        throw new Error("factory must not run on HIT");
      },
      {
        refreshStoreOrderChatUnreadOnHit: async () => 3,
      }
    );
    expect(hit.storeOrderChatUnread).toBe(3);
    expect(hit.orderAttention).toBe(7);
    expect(OWNER_HUB_BADGE_TTL_MS).toBe(12_000);
  });

  it("HIT refresh null keeps cached room-count field (no SQL sum invent)", async () => {
    await getCachedOwnerHubBadge(userId, async () => basePayload({ storeOrderChatUnread: 5 }));
    const hit = await getCachedOwnerHubBadge(
      userId,
      async () => {
        throw new Error("no factory");
      },
      { refreshStoreOrderChatUnreadOnHit: async () => null }
    );
    expect(hit.storeOrderChatUnread).toBe(5);
  });
});

describe("withFreshOwnerStoreOrderChatUnreadOnCacheHit no-hub store", () => {
  it("no active hub store → fresh room count 0 overlay", async () => {
    const cached = basePayload({ storeOrderChatUnread: 5 });
    const out = await withFreshOwnerStoreOrderChatUnreadOnCacheHit({
      cached,
      // unused when storesSb null and memory miss
      sb: { from: () => ({}) } as never,
      storesSb: null,
      userId: "u-no-hub",
    });
    expect(out.storeOrderChatUnread).toBe(0);
    expect(out.orderAttention).toBe(cached.orderAttention);
  });
});

describe("Slice 2-4 cross-isolate structural guards", () => {
  it("route wires refresh on cache get; TTL unchanged; no SQL sum fallback in refresh module", () => {
    const route = readFileSync(join(process.cwd(), "app/api/me/store-owner-hub-badge/route.ts"), "utf8");
    const cache = readFileSync(join(process.cwd(), "lib/chats/owner-hub-badge-cache.ts"), "utf8");
    const refresh = readFileSync(
      join(process.cwd(), "lib/chats/refresh-owner-hub-store-order-chat-unread-on-cache-hit.ts"),
      "utf8"
    );
    expect(route).toContain("refreshStoreOrderChatUnreadOnHit");
    expect(route).toContain("resolveFreshOwnerStoreOrderChatRoomCount");
    expect(cache).toContain("HUB_BADGE_TTL_MS = 12_000");
    expect(cache).toContain("refreshStoreOrderChatUnreadOnHit");
    expect(refresh).toContain("countOwnerStoreOrderMessengerUnreadForHubStore");
    expect(refresh).toContain("DO NOT use SQL message-sum");
    expect(refresh).not.toMatch(/store_order_chat_unread/);
  });
});
