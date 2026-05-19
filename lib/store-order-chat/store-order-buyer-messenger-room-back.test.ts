import { describe, expect, it } from "vitest";
import { resolveStoreOrderBuyerMessengerRoomBackHref } from "@/lib/store-order-chat/store-order-buyer-messenger-room-back";

const deliveryMeta = { v: 1 as const, kind: "delivery" as const, headline: "카페 · 아메" };

describe("resolveStoreOrderBuyerMessengerRoomBackHref", () => {
  it("returns null for seller (owner role)", () => {
    expect(
      resolveStoreOrderBuyerMessengerRoomBackHref({
        contextMeta: deliveryMeta,
        myRole: "owner",
      })
    ).toBeNull();
  });

  it("returns restaurant browse list for 식당 business_type", () => {
    expect(
      resolveStoreOrderBuyerMessengerRoomBackHref({
        contextMeta: deliveryMeta,
        myRole: "member",
        storeSlug: "my-cafe",
        businessType: "식당 · 한식",
      })
    ).toBe("/stores/browse/restaurant?sub=all");
  });

  it("returns hardware browse list for 공구 business_type", () => {
    expect(
      resolveStoreOrderBuyerMessengerRoomBackHref({
        contextMeta: deliveryMeta,
        myRole: "member",
        businessType: "공구류 · 전동공구",
      })
    ).toBe("/stores/browse/hardware?sub=all");
  });

  it("defaults to restaurant browse when taxonomy unknown", () => {
    expect(
      resolveStoreOrderBuyerMessengerRoomBackHref({
        contextMeta: deliveryMeta,
        myRole: "member",
        fromQuery: "delivery",
      })
    ).toBe("/stores/browse/restaurant?sub=all");
  });

  it("returns null for non-delivery rooms", () => {
    expect(
      resolveStoreOrderBuyerMessengerRoomBackHref({
        contextMeta: { v: 1, kind: "trade", headline: "거래" },
        myRole: "member",
      })
    ).toBeNull();
  });
});
