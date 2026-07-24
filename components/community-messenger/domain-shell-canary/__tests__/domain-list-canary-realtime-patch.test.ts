/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDomainListCanaryReadPatchByRoomId,
  applyDomainStoreOrderListRealtimeMessagePatch,
  applyDomainTradeListRealtimeMessagePatch,
  subscribeDomainListCanaryPatch,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";
import {
  clearDomainTradeListCanaryCache,
  peekDomainTradeListCanaryCache,
  primeDomainTradeListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache";
import {
  clearDomainStoreOrderCustomerListCanaryCache,
  peekDomainStoreOrderCustomerListCanaryCache,
  primeDomainStoreOrderCustomerListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import type { SoCustomerListDto } from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";

const UID = "u1";

function seedTradeDto(): TradeListDto {
  return {
    authority: "domain_trade_list_canary",
    viewerUserId: UID,
    producedAt: "2026-07-23T00:00:00.000Z",
    hub: { roomCount: 1, unreadRoomCount: 0, latestRoomId: "t-1", previewText: "old" },
    rows: [
      {
        roomId: "t-1",
        chatDomain: "trade",
        domainIdentityKey: `trade:i1:${UID}:b1`,
        itemId: "i1",
        sellerUserId: UID,
        buyerUserId: "b1",
        viewerRole: "seller",
        productTitle: "Item",
        productImageUrl: null,
        peerLabel: null,
        peerAvatarUrl: null,
        previewText: "old",
        statusBadge: null,
        unreadCount: 0,
        lastMessageAt: "2026-07-20T00:00:00.000Z",
        href: "/x",
      },
    ],
  };
}

function seedSoDto(): SoCustomerListDto {
  return {
    authority: "domain_store_order_customer_list_canary",
    viewerUserId: UID,
    surfaceRole: "customer",
    producedAt: "2026-07-23T00:00:00.000Z",
    hub: { roomCount: 1, unreadRoomCount: 0, latestRoomId: "so-1", previewText: "old" },
    rows: [
      {
        roomId: "so-1",
        chatDomain: "store_order",
        domainIdentityKey: "so:1",
        orderId: "o1",
        storeName: "Store",
        storeImageUrl: null,
        previewText: "old",
        statusBadge: null,
        unreadCount: 0,
        lastMessageAt: "2026-07-20T00:00:00.000Z",
        href: "/y",
        exposesMemberIdentity: false,
      },
    ],
  };
}

describe("domain list canary realtime patch — trade", () => {
  afterEach(() => {
    clearDomainTradeListCanaryCache(UID);
    clearDomainStoreOrderCustomerListCanaryCache(UID);
  });

  it("patches preview/lastMessageAt/unreadCount for a room already in cache", () => {
    primeDomainTradeListCanaryCache(seedTradeDto());
    const ok = applyDomainTradeListRealtimeMessagePatch({
      viewerUserId: UID,
      roomId: "t-1",
      previewText: "new message",
      lastMessageAt: "2026-07-23T01:00:00.000Z",
      boostUnread: true,
    });
    expect(ok).toBe(true);
    const next = peekDomainTradeListCanaryCache(UID);
    expect(next?.rows[0]?.previewText).toBe("new message");
    expect(next?.rows[0]?.unreadCount).toBe(1);
    expect(next?.hub.previewText).toBe("new message");
  });

  it("is a no-op for a room not present in cache (unseen room)", () => {
    primeDomainTradeListCanaryCache(seedTradeDto());
    const ok = applyDomainTradeListRealtimeMessagePatch({
      viewerUserId: UID,
      roomId: "t-never-seen",
      previewText: "hi",
      lastMessageAt: "2026-07-23T01:00:00.000Z",
      boostUnread: true,
    });
    expect(ok).toBe(false);
    expect(peekDomainTradeListCanaryCache(UID)?.rows).toHaveLength(1);
  });

  it("notifies subscribers on successful patch", () => {
    primeDomainTradeListCanaryCache(seedTradeDto());
    const listener = vi.fn();
    const unsub = subscribeDomainListCanaryPatch("trade", listener);
    applyDomainTradeListRealtimeMessagePatch({
      viewerUserId: UID,
      roomId: "t-1",
      previewText: "new message",
      lastMessageAt: "2026-07-23T01:00:00.000Z",
      boostUnread: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("read patch zeroes unreadCount for both trade and store_order cache by roomId", () => {
    const tradeSeed = seedTradeDto();
    tradeSeed.rows[0]!.unreadCount = 3;
    primeDomainTradeListCanaryCache(tradeSeed);
    applyDomainListCanaryReadPatchByRoomId({ viewerUserId: UID, roomId: "t-1" });
    expect(peekDomainTradeListCanaryCache(UID)?.rows[0]?.unreadCount).toBe(0);
  });
});

describe("domain list canary realtime patch — store_order", () => {
  afterEach(() => {
    clearDomainStoreOrderCustomerListCanaryCache(UID);
  });

  it("patches store-order customer list cache for a known room", () => {
    primeDomainStoreOrderCustomerListCanaryCache(seedSoDto());
    const ok = applyDomainStoreOrderListRealtimeMessagePatch({
      viewerUserId: UID,
      roomId: "so-1",
      previewText: "order update",
      lastMessageAt: "2026-07-23T01:00:00.000Z",
      boostUnread: true,
    });
    expect(ok).toBe(true);
    const next = peekDomainStoreOrderCustomerListCanaryCache(UID);
    expect(next?.rows[0]?.previewText).toBe("order update");
    expect(next?.rows[0]?.unreadCount).toBe(1);
  });

  it("read patch by roomId only affects the matching cache, not the other domain's", () => {
    const tradeSeed = seedTradeDto();
    tradeSeed.rows[0]!.unreadCount = 5;
    primeDomainTradeListCanaryCache(tradeSeed);
    const soSeed = seedSoDto();
    soSeed.rows[0]!.unreadCount = 2;
    primeDomainStoreOrderCustomerListCanaryCache(soSeed);
    applyDomainListCanaryReadPatchByRoomId({ viewerUserId: UID, roomId: "so-1" });
    expect(peekDomainStoreOrderCustomerListCanaryCache(UID)?.rows[0]?.unreadCount).toBe(0);
    // trade cache has no room "so-1" — must remain untouched at its seeded value
    expect(peekDomainTradeListCanaryCache(UID)?.rows[0]?.unreadCount).toBe(5);
    clearDomainTradeListCanaryCache(UID);
  });
});
