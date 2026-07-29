import { describe, expect, it } from "vitest";
import { tradeRoomIdentity } from "@/lib/chat-domain/room-identity";
import { shouldBlockNewItemChatForBuyer } from "@/lib/trade/reserved-item-chat";
import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";

/**
 * 거래 권위·역할·캐시 prune 감사 고정 테스트.
 * 제품 정책 변경 없음 — 현재 SSOT 동작을 잠근다.
 */
describe("trade room identity SSOT", () => {
  it("same item + same seller + same buyer → same identity", () => {
    const a = tradeRoomIdentity({ itemId: "item-1", sellerId: "seller-a", buyerId: "buyer-b" });
    const b = tradeRoomIdentity({ itemId: "item-1", sellerId: "seller-a", buyerId: "buyer-b" });
    expect(a.identityKey).toBe(b.identityKey);
    expect(a.domain).toBe("trade");
    expect(a.identityKey).toBe("trade:item-1:seller-a:buyer-b");
  });

  it("different item + same counterpart → different identity", () => {
    const a = tradeRoomIdentity({ itemId: "item-1", sellerId: "seller-a", buyerId: "buyer-b" });
    const b = tradeRoomIdentity({ itemId: "item-2", sellerId: "seller-a", buyerId: "buyer-b" });
    expect(a.identityKey).not.toBe(b.identityKey);
  });

  it("same item + different buyer → different identity", () => {
    const a = tradeRoomIdentity({ itemId: "item-1", sellerId: "seller-a", buyerId: "buyer-1" });
    const b = tradeRoomIdentity({ itemId: "item-1", sellerId: "seller-a", buyerId: "buyer-2" });
    expect(a.identityKey).not.toBe(b.identityKey);
  });
});

describe("trade reserved buyer gate SSOT (shouldBlockNewItemChatForBuyer)", () => {
  const reservedPost = {
    seller_listing_state: "reserved",
    status: "active",
    reserved_buyer_id: "buyer-reserved",
  };

  it("third-party buyer blocked while reserved", () => {
    expect(shouldBlockNewItemChatForBuyer(reservedPost, "buyer-other")).toBe(true);
  });

  it("reserved buyer not blocked by SSOT helper", () => {
    expect(shouldBlockNewItemChatForBuyer(reservedPost, "buyer-reserved")).toBe(false);
  });

  it("inquiry listing does not block new chat", () => {
    expect(
      shouldBlockNewItemChatForBuyer(
        { seller_listing_state: "inquiry", status: "active", reserved_buyer_id: null },
        "buyer-any"
      )
    ).toBe(false);
  });
});

describe("trade cache Map prune (30-cycle growth harness)", () => {
  it("repeated insert+prune keeps size under cap", () => {
    const map = new Map<string, { expiresAt: number }>();
    const maxSize = 8;
    const now0 = 1_000_000;
    for (let i = 0; i < 30; i += 1) {
      const now = now0 + i * 1000;
      map.set(`k-${i}`, { expiresAt: now + 5_000 });
      pruneByExpiresAtAndMaxSize(map, now, maxSize);
      expect(map.size).toBeLessThanOrEqual(maxSize);
    }
    pruneByExpiresAtAndMaxSize(map, now0 + 30_000 + 10_000, maxSize);
    expect(map.size).toBe(0);
  });
});
