import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import {
  __resetOwnerHubBadgeStoreForTest,
  __testApplyOwnerHubBadgePayloadForTest,
  applyDomainAuthorityHubBadgeOptimistic,
  getOwnerHubBadgeSnapshot,
  resetOwnerHubBadgeStoreForAuthEpoch,
} from "@/lib/chats/owner-hub-badge-store";

function hubPayload(overrides: Partial<OwnerHubBadgeBreakdown> & { communityMessengerUnread?: number }) {
  const cm = overrides.communityMessengerUnread ?? 0;
  return {
    ok: true as const,
    chatUnread: overrides.chatUnread ?? 0,
    philifeChatUnread: overrides.philifeChatUnread ?? 0,
    socialChatUnread: overrides.socialChatUnread ?? 0,
    storeOrderChatUnread: overrides.storeOrderChatUnread ?? 0,
    storeOrderOwnerUnreadRooms: overrides.storeOrderOwnerUnreadRooms ?? 0,
    orderAttention: overrides.orderAttention ?? 0,
    inquiryAttention: overrides.inquiryAttention ?? 0,
    ownerReviewAttention: 0,
    storesTabAttention: overrides.storesTabAttention ?? 0,
    buyerOrderAttention: overrides.buyerOrderAttention ?? 0,
    storeDeepLink: overrides.storeDeepLink ?? null,
    total:
      overrides.total ??
      Math.max(0, overrides.socialChatUnread ?? 0) +
        Math.max(0, overrides.storesTabAttention ?? 0) +
        Math.max(0, cm),
    ...overrides,
    communityMessengerUnread: cm,
  };
}

describe("owner-hub-badge-store P1-c Projection axis lock", () => {
  beforeEach(() => {
    __resetOwnerHubBadgeStoreForTest();
  });

  it("Hub network_fresh cannot write CM — only Authority optimistic can", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 9 }), "network_fresh");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);

    applyDomainAuthorityHubBadgeOptimistic({
      communityMessengerUnread: 3,
      tradeUnread: 1,
      storeOrderOwnerUnreadRooms: 2,
      buyerOrderAttention: 1,
      socialChatUnread: 3,
    });
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(3);

    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 99 }), "network_fresh");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(3);
  });

  it("Hub network updates shell fields (philife/FAB/attention) while preserving Projection axes", () => {
    applyDomainAuthorityHubBadgeOptimistic({
      communityMessengerUnread: 5,
      tradeUnread: 2,
      storeOrderOwnerUnreadRooms: 4,
      buyerOrderAttention: 1,
      socialChatUnread: 5,
    });

    __testApplyOwnerHubBadgePayloadForTest(
      hubPayload({
        communityMessengerUnread: 0,
        chatUnread: 99,
        philifeChatUnread: 7,
        storeOrderChatUnread: 3,
        orderAttention: 8,
        inquiryAttention: 2,
        storesTabAttention: 10,
        buyerOrderAttention: 99,
        storeOrderOwnerUnreadRooms: 99,
        storeDeepLink: "/stores/owner/orders",
      }),
      "network_fresh"
    );

    const snap = getOwnerHubBadgeSnapshot();
    expect(snap.communityMessengerUnread).toBe(5);
    expect(snap.chatUnread).toBe(2);
    expect(snap.storeOrderOwnerUnreadRooms).toBe(4);
    expect(snap.buyerOrderAttention).toBe(1);
    // Shell writable
    expect(snap.philifeChatUnread).toBe(7);
    expect(snap.storeOrderChatUnread).toBe(3);
    expect(snap.orderAttention).toBe(8);
    expect(snap.inquiryAttention).toBe(2);
    expect(snap.storesTabAttention).toBe(10);
    expect(snap.storeDeepLink).toBe("/stores/owner/orders");
    // social = CM(Authority) + philife(Hub shell)
    expect(snap.socialChatUnread).toBe(5 + 7);
  });

  it("broadcast / client_cache / network_plain cannot overwrite Authority CM", () => {
    applyDomainAuthorityHubBadgeOptimistic({
      communityMessengerUnread: 2,
      tradeUnread: 0,
      storeOrderOwnerUnreadRooms: 0,
      buyerOrderAttention: 0,
      socialChatUnread: 2,
    });
    for (const kind of ["broadcast", "client_cache", "network_plain"] as const) {
      __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 0 }), kind);
      expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(2);
    }
  });

  it("Authority optimistic can decrease CM after mark_read", () => {
    applyDomainAuthorityHubBadgeOptimistic({
      communityMessengerUnread: 1,
      tradeUnread: 0,
      storeOrderOwnerUnreadRooms: 0,
      buyerOrderAttention: 0,
      socialChatUnread: 1,
    });
    applyDomainAuthorityHubBadgeOptimistic({
      communityMessengerUnread: 0,
      tradeUnread: 0,
      storeOrderOwnerUnreadRooms: 0,
      buyerOrderAttention: 0,
      socialChatUnread: 0,
    });
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);
  });

  it("auth epoch reset clears prior identity snapshot", () => {
    applyDomainAuthorityHubBadgeOptimistic({
      communityMessengerUnread: 3,
      tradeUnread: 2,
      storeOrderOwnerUnreadRooms: 1,
      buyerOrderAttention: 4,
      socialChatUnread: 3,
    });
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(3);

    resetOwnerHubBadgeStoreForAuthEpoch();

    expect(getOwnerHubBadgeSnapshot()).toEqual(
      expect.objectContaining({
        communityMessengerUnread: 0,
        chatUnread: 0,
        storeOrderOwnerUnreadRooms: 0,
        buyerOrderAttention: 0,
      })
    );
  });

  it("P0-2 Absolute writer deleted; P1-c Hub GET Projection write lock present", () => {
    const storeSrc = readFileSync(join(process.cwd(), "lib/chats/owner-hub-badge-store.ts"), "utf8");
    expect(storeSrc).toContain("applyHubBadgeCmUnreadRoomCountAbsolute deleted");
    expect(storeSrc).not.toMatch(/export function applyHubBadgeCmUnreadRoomCountAbsolute\b/);
    expect(storeSrc).toContain("applyDomainAuthorityHubBadgeOptimistic");
    expect(storeSrc).toContain("P1-c LOCK");
    expect(storeSrc).toContain('source.kind !== "optimistic"');
  });

  it("participant increase must not force cmFresh (stale counter wipe)", () => {
    const storeSrc = readFileSync(join(process.cwd(), "lib/chats/owner-hub-badge-store.ts"), "utf8");
    expect(storeSrc).toContain('if (direction === "increase") return false');
    expect(storeSrc).not.toMatch(/if \(direction === "increase"\) return true/);
  });
});
