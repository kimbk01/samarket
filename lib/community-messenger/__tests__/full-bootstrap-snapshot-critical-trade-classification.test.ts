import { describe, expect, it, vi, afterEach } from "vitest";
import { communityMessengerRoomIsConfirmedTrade } from "@/lib/community-messenger/messenger-room-domain";
import { assembleCriticalBootstrapFromSnapshotPayload } from "@/lib/community-messenger/full-bootstrap-snapshot-assemble";
import * as tradeEnrich from "@/lib/community-messenger/trade-chat-list/trade-room-classification-enrich";
import * as supabaseServer from "@/lib/chat/supabase-server";

const VIEWER = "11111111-1111-1111-1111-111111111111";
const PEER = "22222222-2222-2222-2222-222222222222";
const TRADE_ROOM = "901e97e5-81d0-4e13-ae90-993f7aa962d7";

function criticalPayload() {
  const directKey = [VIEWER, PEER].sort().join(":");
  return {
    ok: true,
    tier: "critical",
    list_limit: 30,
    lite_bundle: {
      rooms: [
        {
          id: TRADE_ROOM,
          room_type: "direct",
          room_status: "active",
          direct_key: directKey,
          last_message: "hi",
          last_message_at: "2026-01-02T00:00:00.000Z",
          last_message_type: "text",
        },
      ],
      participants: [
        { room_id: TRADE_ROOM, user_id: VIEWER, unread_count: 0 },
        { room_id: TRADE_ROOM, user_id: PEER, unread_count: 0 },
      ],
      profile_labels: {
        [VIEWER]: { id: VIEWER, display_name: "Me", nickname: null, username: null, avatar_url: null },
        [PEER]: { id: PEER, display_name: "Peer", nickname: null, username: null, avatar_url: null },
      },
    },
    hs5: { chatRows: [], pcRows: [] },
  };
}

describe("assembleCriticalBootstrapFromSnapshotPayload trade classification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs classification enrich before mapping critical rows", async () => {
    vi.spyOn(supabaseServer, "getSupabaseServer").mockReturnValue({ from: () => ({}) } as never);
    const spy = vi
      .spyOn(tradeEnrich, "enrichTradeRoomClassificationForDeferredHomeSync")
      .mockImplementation(async (_sb, _viewer, summaries) => {
        for (const summary of summaries) {
          if (summary.id === TRADE_ROOM) {
            summary.contextMeta = { v: 1, kind: "trade", productChatId: "pc-1", postId: "post-1" };
          }
        }
      });

    const payload = await assembleCriticalBootstrapFromSnapshotPayload(VIEWER, criticalPayload());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(payload?.chats[0]?.room_id).toBe(TRADE_ROOM);
    expect(payload?.chats[0]?.context_meta).toMatchObject({
      kind: "trade",
      productChatId: "pc-1",
    });
    expect(communityMessengerRoomIsConfirmedTrade({ contextMeta: payload?.chats[0]?.context_meta } as never)).toBe(
      true
    );
  });
});

const DELIVERY_ROOM = "75313bc5-6bfa-47d4-9cf7-4c942ef18694";
const ORDER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function criticalDeliveryPayload() {
  return {
    ok: true,
    tier: "critical",
    list_limit: 30,
    lite_bundle: {
      rooms: [
        {
          id: DELIVERY_ROOM,
          room_type: "direct",
          room_status: "active",
          direct_key: `store_order:${ORDER_ID}`,
          title: "매장",
          last_message: "주문 접수",
          last_message_at: "2026-01-02T00:00:00.000Z",
          last_message_type: "text",
        },
      ],
      participants: [
        { room_id: DELIVERY_ROOM, user_id: VIEWER, unread_count: 0 },
        { room_id: DELIVERY_ROOM, user_id: PEER, unread_count: 0 },
      ],
      profile_labels: {
        [VIEWER]: { id: VIEWER, display_name: "Me", nickname: null, username: null, avatar_url: null },
        [PEER]: { id: PEER, display_name: "Peer", nickname: null, username: null, avatar_url: null },
      },
    },
    hs5: { chatRows: [], pcRows: [] },
    order_context: {
      store_orders: [
        {
          id: ORDER_ID,
          order_status: "preparing",
          community_messenger_room_id: DELIVERY_ROOM,
          store_id: "store-2",
          store_name: "MARKET MARKET",
          profile_image_url: "https://cdn.example/m.jpg",
        },
      ],
    },
  };
}

describe("assembleCriticalBootstrapFromSnapshotPayload store-order store name", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("puts order_context store_name on critical context_meta for first paint", async () => {
    vi.spyOn(supabaseServer, "getSupabaseServer").mockReturnValue(null as never);
    vi.spyOn(tradeEnrich, "enrichTradeRoomClassificationForDeferredHomeSync").mockResolvedValue(undefined);

    const payload = await assembleCriticalBootstrapFromSnapshotPayload(VIEWER, criticalDeliveryPayload());
    expect(payload?.chats[0]?.room_id).toBe(DELIVERY_ROOM);
    expect(payload?.chats[0]?.context_meta).toMatchObject({
      kind: "delivery",
      storeDisplayName: "MARKET MARKET",
      storeId: "store-2",
      storeOrderId: ORDER_ID,
    });
  });
});
