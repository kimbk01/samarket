import { describe, expect, it } from "vitest";
import { communityMessengerRoomIsConfirmedTrade } from "@/lib/community-messenger/messenger-room-domain";
import { summaryToCriticalRow } from "@/lib/community-messenger/bootstrap/critical-stage";
import { enrichTradeRoomClassificationForDeferredHomeSync } from "@/lib/community-messenger/trade-chat-list/trade-room-classification-enrich";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const VIEWER = "viewer-1";
const PEER = "peer-1";

function room(
  partial: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id">
): CommunityMessengerRoomSummary {
  const { id, ...rest } = partial;
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "Room",
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
    peerUserId: PEER,
    ...rest,
  };
}

function mockSb(tables: Record<string, { data: unknown }>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          in: async () => ({ data: tables[table]?.data ?? [] }),
        }),
        in: async () => ({ data: tables[table]?.data ?? [] }),
      }),
    }),
  };
}

describe("critical bootstrap trade classification", () => {
  it("maps enriched trade contextMeta into critical row context_meta", async () => {
    /**
     * Non-GF / non-commerce key so deferred enrich can stamp contextMeta via product_chats FK.
     * GF pair keys must never receive trade stamps (4-domain separation).
     */
    const peerTrade = room({
      id: "room-peer-trade",
      messengerDirectKey: null,
    });
    const sb = mockSb({
      product_chats: {
        data: [
          {
            id: "pc-peer",
            post_id: "post-peer",
            community_messenger_room_id: "room-peer-trade",
          },
        ],
      },
      chat_rooms: { data: [] },
    });
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [peerTrade]);
    expect(communityMessengerRoomIsConfirmedTrade(peerTrade)).toBe(true);

    const row = summaryToCriticalRow(peerTrade, [
      { user_id: VIEWER, label: "Me", avatar_url: null },
      { user_id: PEER, label: "Peer", avatar_url: null },
    ]);
    expect(row.context_meta).toMatchObject({
      v: 1,
      kind: "trade",
      productChatId: "pc-peer",
      postId: "post-peer",
    });
  });

  it("keeps general friend room non-trade in critical row", async () => {
    const general = room({
      id: "room-general",
      messengerDirectKey: `${VIEWER}:${PEER}`,
    });
    const sb = mockSb({
      product_chats: { data: [] },
      chat_rooms: { data: [] },
    });
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [general]);
    expect(communityMessengerRoomIsConfirmedTrade(general)).toBe(false);
    const row = summaryToCriticalRow(general, []);
    expect(row.context_meta ?? null).toBeNull();
  });
});
