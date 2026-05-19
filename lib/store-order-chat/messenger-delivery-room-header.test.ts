import { describe, expect, it } from "vitest";
import {
  buyerNicknameForOwnerHeader,
  resolveStoreOrderDeliveryHeaderMode,
} from "@/lib/store-order-chat/messenger-delivery-room-header";

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
        },
      })
    ).toBe("owner_buyer_peer");
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
