import { describe, expect, it, vi } from "vitest";
import { indexLatestOrderCompletedAtByOrderId } from "@/lib/community-messenger/delivery-chat-list/delivery-context-meta-lifecycle-enrich";
import { enrichDeliveryRoomLifecycleFieldsFromStoreOrders } from "@/lib/community-messenger/delivery-chat-list/delivery-context-meta-lifecycle-enrich";
import { enrichTradeRoomLifecycleFieldsFromProductChats } from "@/lib/community-messenger/trade-chat-list/trade-context-meta-lifecycle-enrich";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function baseSummary(partial: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
  return {
    id: partial.id ?? "room-1",
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    messengerDirectKey: partial.messengerDirectKey ?? null,
    contextMeta: partial.contextMeta ?? null,
  };
}

describe("indexLatestOrderCompletedAtByOrderId", () => {
  it("keeps latest order_completed timestamp per order", () => {
    const map = indexLatestOrderCompletedAtByOrderId([
      { order_id: "o1", event_type: "order_completed", created_at: "2026-06-01T00:00:00.000Z" },
      { order_id: "o1", event_type: "order_completed", created_at: "2026-06-02T00:00:00.000Z" },
      { order_id: "o2", event_type: "status_changed", created_at: "2026-06-03T00:00:00.000Z" },
    ]);
    expect(map.get("o1")).toBe("2026-06-02T00:00:00.000Z");
    expect(map.has("o2")).toBe(false);
  });
});

describe("enrichTradeRoomLifecycleFieldsFromProductChats", () => {
  it("loads lifecycle fields by productChatId", async () => {
    const summary = baseSummary({
      id: "room-t",
      messengerDirectKey: "trade_pc:pc-1",
      contextMeta: { v: 1, kind: "trade", headline: "상품", productChatId: "pc-1" },
    });
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: [
              {
                id: "pc-1",
                post_id: "post-1",
                seller_id: "s1",
                buyer_id: "b1",
                trade_flow_status: "buyer_confirmed",
                chat_mode: "readonly",
                seller_completed_at: "2026-06-01T12:00:00.000Z",
                buyer_confirmed_at: "2026-06-02T12:00:00.000Z",
                community_messenger_room_id: "room-t",
              },
            ],
          })),
        })),
      })),
    };
    await enrichTradeRoomLifecycleFieldsFromProductChats(sb, [summary]);
    expect(summary.contextMeta?.sellerId).toBe("s1");
    expect(summary.contextMeta?.completedAt).toBe("2026-06-02T12:00:00.000Z");
    expect(summary.isReadonly).toBe(true);
  });
});

describe("enrichDeliveryRoomLifecycleFieldsFromStoreOrders", () => {
  it("loads orderStatus and deliveryCompletedAt", async () => {
    const summary = baseSummary({
      id: "room-d",
      messengerDirectKey: "store_order:ord-1",
      contextMeta: { v: 1, kind: "delivery", headline: "주문", storeOrderId: "ord-1" },
    });
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "store_orders") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  {
                    id: "ord-1",
                    order_status: "completed",
                    community_messenger_room_id: "room-d",
                  },
                ],
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [
                  {
                    order_id: "ord-1",
                    event_type: "order_completed",
                    created_at: "2026-06-03T09:00:00.000Z",
                  },
                ],
              })),
            })),
          })),
        };
      }),
    };
    await enrichDeliveryRoomLifecycleFieldsFromStoreOrders(sb, [summary]);
    expect(summary.contextMeta?.orderStatus).toBe("completed");
    expect(summary.contextMeta?.deliveryCompletedAt).toBe("2026-06-03T09:00:00.000Z");
    expect(summary.isReadonly).toBe(true);
  });
});
