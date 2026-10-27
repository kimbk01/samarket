import { describe, expect, it } from "vitest";
import {
  counterpartyUserIdForSellerView,
  pickItemTradeRoomForProductChat,
} from "@/lib/mypage/sales-history-scope";

const POST = "post-1";
const SELLER = "seller";

describe("pickItemTradeRoomForProductChat — 판매자 화면 구매자 식별 (TM-01)", () => {
  const roomY = { item_id: POST, seller_id: SELLER, buyer_id: "buyer-y" };

  it("정확히 같은 쌍의 방을 고른다", () => {
    const roomX = { item_id: POST, seller_id: SELLER, buyer_id: "buyer-x" };
    const pc = { seller_id: SELLER, buyer_id: "buyer-x" };
    expect(pickItemTradeRoomForProductChat(POST, SELLER, pc, [roomY, roomX])).toBe(roomX);
  });

  it("seller/buyer 가 뒤집힌 같은 쌍은 허용한다", () => {
    const flipped = { item_id: POST, seller_id: "buyer-x", buyer_id: SELLER };
    const pc = { seller_id: SELLER, buyer_id: "buyer-x" };
    expect(pickItemTradeRoomForProductChat(POST, SELLER, pc, [roomY, flipped])).toBe(flipped);
  });

  it("같은 쌍이 없으면 다른 구매자의 방으로 대체하지 않는다", () => {
    const pc = { seller_id: SELLER, buyer_id: "buyer-x" };
    const room = pickItemTradeRoomForProductChat(POST, SELLER, pc, [roomY]);
    expect(room).toBeUndefined();
    expect(counterpartyUserIdForSellerView(SELLER, pc, room)).toBe("buyer-x");
  });

  it("다른 글의 방은 고르지 않는다", () => {
    const other = { item_id: "post-2", seller_id: SELLER, buyer_id: "buyer-x" };
    const pc = { seller_id: SELLER, buyer_id: "buyer-x" };
    expect(pickItemTradeRoomForProductChat(POST, SELLER, pc, [other])).toBeUndefined();
  });
});
