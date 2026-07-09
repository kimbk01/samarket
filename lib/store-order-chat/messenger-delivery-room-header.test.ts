import { describe, expect, it } from "vitest";
import {
  buyerNicknameForOwnerHeader,
  formatDeliveryMessengerPresenceIndustrySubtitle,
  isStoreTechnicalIdentifier,
  resolveDeliveryChromePrimaryLabel,
  resolveDeliveryStoreDisplayName,
  resolveDeliveryStoreIndustryParts,
  resolveDeliveryStoreIndustrySubtitle,
  resolveStoreOrderBuyerVoicePeerLabel,
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

  it("admin on delivery room keeps buyer_store (no room.title fallback)", () => {
    expect(
      resolveStoreOrderDeliveryHeaderMode({
        isDeliveryRoom: true,
        myRole: "admin",
        storeOrderSnap: null,
      })
    ).toBe("buyer_store");
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

describe("resolveDeliveryStoreIndustrySubtitle", () => {
  it("parses 1·2차 from business_type", () => {
    expect(
      resolveDeliveryStoreIndustrySubtitle({
        storeBusinessType: "식당 · 한식",
      })
    ).toBe("식당 · 한식");
  });

  it("falls back to primary category name", () => {
    expect(
      resolveDeliveryStoreIndustrySubtitle({
        storePrimaryCategoryName: "식당",
      })
    ).toBe("식당");
  });

  it("merges 1차 business_type with 2차 topic name", () => {
    expect(
      resolveDeliveryStoreIndustrySubtitle({
        storeBusinessType: "식당",
        storeSecondaryCategoryName: "한식",
      })
    ).toBe("식당 · 한식");
  });
});

describe("resolveDeliveryStoreIndustryParts", () => {
  it("splits primary and secondary from taxonomy fields", () => {
    expect(
      resolveDeliveryStoreIndustryParts({
        storePrimaryCategoryName: "식당",
        storeSecondaryCategoryName: "한식",
      })
    ).toEqual({ primary: "식당", secondary: "한식" });
  });
});

describe("formatDeliveryMessengerPresenceIndustrySubtitle", () => {
  it("joins presence and industries with hyphen separators", () => {
    expect(
      formatDeliveryMessengerPresenceIndustrySubtitle({
        presenceLine: "온라인",
        industryPrimary: "식당",
        industrySecondary: "한식",
      })
    ).toBe("온라인 - 식당 - 한식");
  });

  it("omits missing segments", () => {
    expect(
      formatDeliveryMessengerPresenceIndustrySubtitle({
        presenceLine: "오프라인",
        industryPrimary: "식당",
      })
    ).toBe("오프라인 - 식당");
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

describe("resolveStoreOrderBuyerVoicePeerLabel", () => {
  it("returns store display name for buyer_store mode", () => {
    expect(
      resolveStoreOrderBuyerVoicePeerLabel({
        headerMode: "buyer_store",
        storeDisplayName: "나의 카페",
      })
    ).toBe("나의 카페");
  });

  it("ignores owner nickname when mode is buyer_store even if passed as slug", () => {
    expect(
      resolveStoreOrderBuyerVoicePeerLabel({
        headerMode: "buyer_store",
        storeDisplayName: "나의 카페",
      })
    ).not.toBe("owner_nickname_123");
  });

  it("returns empty for non-buyer_store modes", () => {
    expect(
      resolveStoreOrderBuyerVoicePeerLabel({
        headerMode: "owner_buyer_peer",
        storeDisplayName: "나의 카페",
      })
    ).toBe("");
  });
});
