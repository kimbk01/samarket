import { describe, expect, it } from "vitest";
import { applyCommerceLifecycleFromSnapshotPayload } from "@/lib/community-messenger/home-sync-snapshot-commerce-lifecycle-apply";
import type { HomeSyncSnapshotPayloadJson } from "@/lib/community-messenger/home-sync-snapshot-assemble";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function tradeRoom(id: string, directKey: string): CommunityMessengerRoomSummary {
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "거래",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    messengerDirectKey: directKey,
    contextMeta: { v: 1, kind: "trade", headline: "거래" },
  };
}

function deliveryRoom(id: string, directKey: string): CommunityMessengerRoomSummary {
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "주문",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    messengerDirectKey: directKey,
    contextMeta: { v: 1, kind: "delivery", headline: "주문", storeOrderId: "order-1" },
  };
}

describe("applyCommerceLifecycleFromSnapshotPayload", () => {
  it("merges trade lifecycle from preloaded product_chats rows", () => {
    const summaries = [tradeRoom("room-trade", "trade_pc:pc-1")];
    const payload: HomeSyncSnapshotPayloadJson = {
      commerce_lifecycle: {
        product_chats: [
          {
            id: "pc-1",
            post_id: "post-1",
            seller_id: "seller-1",
            buyer_id: "buyer-1",
            trade_flow_status: "buyer_confirmed",
            chat_mode: "readonly",
            seller_completed_at: "2026-06-01T12:00:00.000Z",
            buyer_confirmed_at: "2026-06-02T12:00:00.000Z",
            community_messenger_room_id: "room-trade",
          },
        ],
        store_orders: [],
        order_completed_events: [],
      },
    };
    applyCommerceLifecycleFromSnapshotPayload(summaries, payload);
    expect(summaries[0]?.contextMeta?.sellerId).toBe("seller-1");
    expect(summaries[0]?.contextMeta?.buyerId).toBe("buyer-1");
    expect(summaries[0]?.contextMeta?.tradeFlowStatus).toBe("buyer_confirmed");
    expect(summaries[0]?.contextMeta?.completedAt).toBe("2026-06-02T12:00:00.000Z");
    expect(summaries[0]?.isReadonly).toBe(true);
  });

  it("merges delivery lifecycle from preloaded store_orders and completed events", () => {
    const summaries = [deliveryRoom("room-delivery", "store_order:order-1")];
    const payload: HomeSyncSnapshotPayloadJson = {
      commerce_lifecycle: {
        product_chats: [],
        store_orders: [
          {
            id: "order-1",
            order_status: "completed",
            community_messenger_room_id: "room-delivery",
          },
        ],
        order_completed_events: [
          {
            order_id: "order-1",
            created_at: "2026-06-08T07:49:10.294Z",
            event_type: "order_completed",
          },
        ],
      },
    };
    applyCommerceLifecycleFromSnapshotPayload(summaries, payload);
    expect(summaries[0]?.contextMeta?.orderStatus).toBe("completed");
    expect(summaries[0]?.contextMeta?.completedAt).toBe("2026-06-08T07:49:10.294Z");
    expect(summaries[0]?.isReadonly).toBe(true);
  });

  it("no-ops when commerce_lifecycle block is absent", () => {
    const summaries = [tradeRoom("room-trade", "trade_pc:pc-1")];
    const before = { ...summaries[0]!.contextMeta };
    applyCommerceLifecycleFromSnapshotPayload(summaries, {});
    expect(summaries[0]?.contextMeta).toEqual(before);
  });
});
