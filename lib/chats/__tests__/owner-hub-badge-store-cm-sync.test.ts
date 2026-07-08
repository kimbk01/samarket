import { describe, expect, it, beforeEach } from "vitest";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import {
  __resetOwnerHubBadgeStoreForTest,
  __testApplyOwnerHubBadgePayloadForTest,
  getOwnerHubBadgeSnapshot,
} from "@/lib/chats/owner-hub-badge-store";

function hubPayload(overrides: Partial<OwnerHubBadgeBreakdown> & { communityMessengerUnread: number }) {
  const cm = overrides.communityMessengerUnread;
  return {
    ok: true as const,
    chatUnread: 0,
    philifeChatUnread: overrides.philifeChatUnread ?? 0,
    socialChatUnread: overrides.socialChatUnread ?? 0,
    storeOrderChatUnread: 0,
    orderAttention: overrides.orderAttention ?? 0,
    inquiryAttention: 0,
    ownerReviewAttention: 0,
    storesTabAttention: overrides.storesTabAttention ?? 0,
    buyerOrderAttention: 0,
    storeDeepLink: null,
    total:
      overrides.total ??
      Math.max(0, overrides.socialChatUnread ?? 0) +
        Math.max(0, overrides.storesTabAttention ?? 0) +
        Math.max(0, cm),
    ...overrides,
    communityMessengerUnread: cm,
  };
}

describe("owner-hub-badge-store communityMessengerUnread sync", () => {
  beforeEach(() => {
    __resetOwnerHubBadgeStoreForTest();
  });

  it("applies fresh network cm=1 after stale store cm=0", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 0 }), "client_cache");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);

    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "network_fresh");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("ignores stale broadcast cm=0 after fresh network cm=1", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "network_fresh");
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 0 }), "broadcast");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(1);
  });

  it("keeps snapshot stable on duplicate identical broadcast", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "network_fresh");
    const before = getOwnerHubBadgeSnapshot();
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "broadcast");
    expect(getOwnerHubBadgeSnapshot()).toEqual(before);
  });

  it("does not clobber trade/delivery/community fields when guarding cm downgrade", () => {
    __testApplyOwnerHubBadgePayloadForTest(
      hubPayload({
        communityMessengerUnread: 1,
        storesTabAttention: 7,
        philifeChatUnread: 4,
        socialChatUnread: 2,
      }),
      "network_fresh"
    );
    __testApplyOwnerHubBadgePayloadForTest(
      hubPayload({
        communityMessengerUnread: 0,
        storesTabAttention: 7,
        philifeChatUnread: 4,
        socialChatUnread: 2,
      }),
      "broadcast"
    );
    const snap = getOwnerHubBadgeSnapshot();
    expect(snap.communityMessengerUnread).toBe(1);
    expect(snap.storesTabAttention).toBe(7);
    expect(snap.philifeChatUnread).toBe(4);
    expect(snap.socialChatUnread).toBe(2);
  });

  it("allows fresh network cm decrease after mark_read (network_fresh cm=0)", () => {
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 1 }), "network_fresh");
    __testApplyOwnerHubBadgePayloadForTest(hubPayload({ communityMessengerUnread: 0 }), "network_fresh");
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);
  });
});
