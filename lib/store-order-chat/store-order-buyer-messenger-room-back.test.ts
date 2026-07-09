import { describe, expect, it } from "vitest";
import { resolveStoreOrderBuyerMessengerRoomBackHref } from "@/lib/store-order-chat/store-order-buyer-messenger-room-back";

const deliveryMeta = { v: 1 as const, kind: "delivery" as const, headline: "카페 · 아메" };

describe("resolveStoreOrderBuyerMessengerRoomBackHref", () => {
  it("always returns null — browse 직행 override removed", () => {
    expect(
      resolveStoreOrderBuyerMessengerRoomBackHref({
        contextMeta: deliveryMeta,
        myRole: "member",
        storeSlug: "my-cafe",
        businessType: "식당 · 한식",
      })
    ).toBeNull();
  });

  it("returns null for seller (owner role)", () => {
    expect(
      resolveStoreOrderBuyerMessengerRoomBackHref({
        contextMeta: deliveryMeta,
        myRole: "owner",
      })
    ).toBeNull();
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
