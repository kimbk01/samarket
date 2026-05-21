import { describe, expect, it } from "vitest";
import { buildStoreOrderMessengerRoomHref } from "@/lib/chats/surfaces/order-chat-surface";

describe("buildStoreOrderMessengerRoomHref", () => {
  it("sets delivery list back params", () => {
    const href = buildStoreOrderMessengerRoomHref("room-abc");
    expect(href).toContain("/community-messenger/rooms/room-abc");
    expect(href).toContain("from=delivery");
    expect(href).toContain("cm_list=delivery");
  });

  it("attaches cm_return when returnHref provided", () => {
    const href = buildStoreOrderMessengerRoomHref("room-abc", {
      returnHref: "/mypage/store-orders/ord-1",
    });
    expect(href).toContain("cm_return=");
    expect(decodeURIComponent(href)).toContain("/mypage/store-orders/ord-1");
  });

  it("attaches cm_ctx for delivery meta", () => {
    const href = buildStoreOrderMessengerRoomHref("room-abc", {
      contextMeta: {
        v: 1,
        kind: "delivery",
        storeOrderId: "order-1",
        headline: "매장 · 라면",
      },
    });
    expect(href).toContain("cm_ctx=");
  });
});
