import { describe, expect, it } from "vitest";
import {
  COMPLETED_CHAT_LIST_VISIBLE_MS,
  isCompletedChatReadonly,
  shouldHideCompletedChatFromList,
  shouldShowCommerceChatInList,
} from "@/lib/community-messenger/chat-room-list-lifecycle-policy";
import { mergeStoreOrderLifecycleIntoDeliveryContextMeta } from "@/lib/community-messenger/delivery-chat-list/delivery-context-meta-lifecycle-enrich";
import {
  mergeProductChatLifecycleIntoTradeContextMeta,
  productChatChatModeIsReadonly,
  resolveTradeCompletedAtIso,
} from "@/lib/community-messenger/trade-chat-list/trade-context-meta-lifecycle-enrich";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

describe("resolveTradeCompletedAtIso", () => {
  it("uses later of seller and buyer timestamps", () => {
    expect(
      resolveTradeCompletedAtIso({
        seller_completed_at: "2026-06-01T10:00:00.000Z",
        buyer_confirmed_at: "2026-06-02T10:00:00.000Z",
      })
    ).toBe("2026-06-02T10:00:00.000Z");
  });
});

describe("mergeProductChatLifecycleIntoTradeContextMeta", () => {
  it("fills triple and completion timestamps from product_chats row", () => {
    const meta = mergeProductChatLifecycleIntoTradeContextMeta(
      { v: 1, kind: "trade", headline: "상품" },
      {
        id: "pc-1",
        post_id: "post-1",
        seller_id: "seller-1",
        buyer_id: "buyer-1",
        trade_flow_status: "buyer_confirmed",
        chat_mode: "open",
        seller_completed_at: "2026-06-01T12:00:00.000Z",
        buyer_confirmed_at: "2026-06-02T12:00:00.000Z",
      }
    );
    expect(meta.sellerId).toBe("seller-1");
    expect(meta.buyerId).toBe("buyer-1");
    expect(meta.completedAt).toBe("2026-06-02T12:00:00.000Z");
    expect(meta.tradeFlowStatus).toBe("buyer_confirmed");
  });
});

describe("realdata-style lifecycle integration", () => {
  function tradeRoom(completedAt: string): CommunityMessengerRoomSummary {
    const meta = mergeProductChatLifecycleIntoTradeContextMeta(
      { v: 1, kind: "trade", headline: "자전거", roleLabel: "판매자" },
      {
        id: "pc-1",
        post_id: "post-1",
        seller_id: "seller-1",
        buyer_id: "buyer-1",
        trade_flow_status: "buyer_confirmed",
        chat_mode: "readonly",
        seller_completed_at: completedAt,
        buyer_confirmed_at: completedAt,
      }
    );
    return {
      id: "room-1",
      roomType: "direct",
      roomStatus: "active",
      visibility: "private",
      joinPolicy: "invite_only",
      identityPolicy: "real_name",
      isReadonly: productChatChatModeIsReadonly("readonly"),
      title: "구매자",
      subtitle: "",
      summary: "",
      avatarUrl: null,
      unreadCount: 0,
      lastMessage: "",
      lastMessageAt: completedAt,
      memberCount: 2,
      ownerUserId: null,
      ownerLabel: "",
      memberLimit: null,
      isDiscoverable: false,
      requiresPassword: false,
      allowMemberInvite: false,
      contextMeta: meta,
    };
  }

  it("trade: readonly + visible at 6d23h, hidden after 7d", () => {
    const completedAt = "2026-06-01T12:00:00.000Z";
    const anchorMs = Date.parse(completedAt);
    const room = tradeRoom(completedAt);

    expect(isCompletedChatReadonly(room)).toBe(true);
    expect(shouldShowCommerceChatInList(room, anchorMs + COMPLETED_CHAT_LIST_VISIBLE_MS - 60 * 60 * 1000)).toBe(
      true
    );
    expect(shouldHideCompletedChatFromList(room, anchorMs + COMPLETED_CHAT_LIST_VISIBLE_MS + 1)).toBe(true);
    expect(isCompletedChatReadonly(room)).toBe(true);
  });

  it("delivery: readonly + visible at 6d23h, hidden after 7d", () => {
    const completedAt = "2026-06-01T12:00:00.000Z";
    const anchorMs = Date.parse(completedAt);
    const meta = mergeStoreOrderLifecycleIntoDeliveryContextMeta(
      { v: 1, kind: "delivery", headline: "매장 · 주문" },
      { orderId: "ord-1", orderStatus: "completed", deliveryCompletedAt: completedAt }
    );
    const room: CommunityMessengerRoomSummary = {
      id: "room-d",
      roomType: "direct",
      roomStatus: "active",
      visibility: "private",
      joinPolicy: "invite_only",
      identityPolicy: "real_name",
      isReadonly: true,
      title: "매장",
      subtitle: "",
      summary: "",
      avatarUrl: null,
      unreadCount: 0,
      lastMessage: "",
      lastMessageAt: completedAt,
      memberCount: 2,
      ownerUserId: null,
      ownerLabel: "",
      memberLimit: null,
      isDiscoverable: false,
      requiresPassword: false,
      allowMemberInvite: false,
      contextMeta: meta,
    };

    expect(isCompletedChatReadonly(room)).toBe(true);
    expect(shouldShowCommerceChatInList(room, anchorMs + COMPLETED_CHAT_LIST_VISIBLE_MS - 60 * 60 * 1000)).toBe(
      true
    );
    expect(shouldHideCompletedChatFromList(room, anchorMs + COMPLETED_CHAT_LIST_VISIBLE_MS + 1)).toBe(true);
  });
});
