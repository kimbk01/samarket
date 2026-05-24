import { describe, expect, it } from "vitest";
import {
  buyerNicknameForOwnerHeader,
  isStoreTechnicalIdentifier,
  resolveDeliveryChromePrimaryLabel,
  resolveDeliveryStoreDisplayName,
  resolveStoreOrderDeliveryHeaderMode,
} from "@/lib/store-order-chat/messenger-delivery-room-header";
import { resolveDeliveryRoomMessageSenderLabel } from "@/lib/store-order-chat/use-delivery-room-message-sender-label";

describe("resolveStoreOrderDeliveryHeaderMode", () => {
  it("owner role stays buyer-peer header even before snap loads", () => {
    expect(
      resolveStoreOrderDeliveryHeaderMode({
        isDeliveryRoom: true,
        myRole: "owner",
        storeOrderSnap: null,
      })
    ).toBe("owner_buyer_peer");
  });

  it("member with buyer snap never flips to owner header", () => {
    expect(
      resolveStoreOrderDeliveryHeaderMode({
        isDeliveryRoom: true,
        myRole: "member",
        storeOrderSnap: {
          buyerOrder: {} as never,
          buyerItems: [],
          ownerOrder: null,
          orderNo: "1",
          orderCard: null,
          storeProfileImageUrl: null,
          storeSlug: null,
          storeBusinessType: null,
          storeCategorySlug: null,
        },
      })
    ).toBe("buyer_store");
  });

  it("owner snap confirms owner header", () => {
    expect(
      resolveStoreOrderDeliveryHeaderMode({
        isDeliveryRoom: true,
        myRole: "member",
        storeOrderSnap: {
          buyerOrder: null,
          buyerItems: [],
          ownerOrder: { id: "o", order_status: "pending", fulfillment_type: "delivery" },
          orderNo: "1",
          orderCard: null,
          storeProfileImageUrl: null,
          storeSlug: null,
          storeBusinessType: null,
          storeCategorySlug: null,
        },
      })
    ).toBe("owner_buyer_peer");
  });
});

describe("resolveDeliveryChromePrimaryLabel", () => {
  it("seller sees buyer peer label", () => {
    expect(
      resolveDeliveryChromePrimaryLabel({
        isSeller: true,
        storeOrderSnap: null,
        peerProfileLabel: "홍길동",
        roomTitle: "매장 · 상품",
        deliveryHeadline: "카페 · 주문",
      })
    ).toBe("홍길동");
  });

  it("buyer sees store from order card", () => {
    expect(
      resolveDeliveryChromePrimaryLabel({
        isSeller: false,
        storeOrderSnap: {
          buyerOrder: null,
          buyerItems: [],
          ownerOrder: null,
          orderNo: "1",
          orderCard: { storeName: "스타벅스" } as never,
          storeProfileImageUrl: null,
          storeSlug: null,
          storeBusinessType: null,
          storeCategorySlug: null,
        },
        peerProfileLabel: null,
        roomTitle: "room",
        deliveryHeadline: undefined,
      })
    ).toBe("스타벅스");
  });
});

describe("resolveDeliveryStoreDisplayName", () => {
  it("never uses store slug as display name", () => {
    expect(
      resolveDeliveryStoreDisplayName({
        orderCardStoreName: null,
        deliveryHeadline: "나의 카페 · 아메리카노",
        roomTitle: "my-cafe-slug",
        storeSlug: "my-cafe-slug",
      })
    ).toBe("나의 카페");
  });

  it("rejects uuid-like room title", () => {
    expect(
      resolveDeliveryStoreDisplayName({
        roomTitle: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
        storeId: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      })
    ).toBe("매장");
  });
});

describe("isStoreTechnicalIdentifier", () => {
  it("matches store id and slug", () => {
    expect(isStoreTechnicalIdentifier("cafe-01", { storeSlug: "cafe-01" })).toBe(true);
    expect(isStoreTechnicalIdentifier("홍카페", { storeSlug: "cafe-01" })).toBe(false);
  });
});

describe("resolveDeliveryRoomMessageSenderLabel", () => {
  it("buyer sees store name instead of member handle", () => {
    expect(
      resolveDeliveryRoomMessageSenderLabel({
        isDeliveryRoom: true,
        isMine: false,
        rawLabel: "테스트1 (@aa11)",
        headerMode: "buyer_store",
        storeDisplayName: "나의 오른손딸방",
        buyerDisplayName: "",
      })
    ).toBe("나의 오른손딸방");
  });
});

describe("buyerNicknameForOwnerHeader", () => {
  it("does not use store headline as buyer name", () => {
    expect(buyerNicknameForOwnerHeader(null, "나의 오른손딸방 · 김치김밥")).toBe("주문자");
  });

  it("uses peer profile label first", () => {
    expect(buyerNicknameForOwnerHeader("홍길동", "매장 · 상품")).toBe("홍길동");
  });
});
