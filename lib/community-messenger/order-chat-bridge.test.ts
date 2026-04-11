import { describe, expect, it } from "vitest";
import { buildMessengerContextMetaFromOrderChatSnapshot } from "@/lib/community-messenger/order-chat-bridge";
import type { OrderChatRoomPublic } from "@/lib/order-chat/types";

describe("buildMessengerContextMetaFromOrderChatSnapshot", () => {
  it("maps delivery flow and order headline", () => {
    const room = {
      id: "r1",
      order_id: "o1",
      order_no: "A-100",
      store_id: "s1",
      store_name: "테스트 매장",
      buyer_user_id: "b1",
      buyer_name: "구매",
      owner_user_id: "o1",
      owner_name: "사장",
      order_flow: "delivery",
      room_status: "active",
      last_message: "",
      last_message_at: "",
      unread_count_buyer: 0,
      unread_count_owner: 0,
      unread_count_admin: 0,
      last_chat_order_status: null,
      created_at: "",
      updated_at: "",
    } satisfies OrderChatRoomPublic;
    const meta = buildMessengerContextMetaFromOrderChatSnapshot(room, "preparing");
    expect(meta.kind).toBe("delivery");
    expect(meta.headline).toContain("테스트 매장");
    expect(meta.headline).toContain("A-100");
    expect(meta.stepLabel).toBeTruthy();
  });
});
