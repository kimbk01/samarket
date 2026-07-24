import { describe, expect, it } from "vitest";
import { communityMessengerRoomIsConfirmedTrade } from "@/lib/community-messenger/messenger-room-domain";
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

describe("enrichTradeRoomClassificationForDeferredHomeSync", () => {
  it("A: metadata-present trade room is unchanged", async () => {
    const trade = room({
      id: "trade-1",
      messengerDirectKey: "trade_pc:pc-1",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1", postId: "post-1" },
    });
    await enrichTradeRoomClassificationForDeferredHomeSync(null, VIEWER, [trade]);
    expect(communityMessengerRoomIsConfirmedTrade(trade)).toBe(true);
    expect(trade.contextMeta?.kind).toBe("trade");
  });

  it("B: product_chats FK on commerce/unknown room assigns trade; GF pair key never stamped", async () => {
    const commerce = room({
      id: "room-legacy",
      messengerDirectKey: "trade_pc:pc-legacy",
    });
    const gfPolluted = room({
      id: "gf-polluted",
      messengerDirectKey: `${VIEWER}:${PEER}`,
      peerUserId: PEER,
    });
    const sb = mockSb({
      product_chats: {
        data: [
          {
            id: "pc-legacy",
            post_id: "post-legacy",
            community_messenger_room_id: "room-legacy",
          },
          {
            id: "pc-gf",
            post_id: "post-gf",
            community_messenger_room_id: "gf-polluted",
          },
        ],
      },
      chat_rooms: { data: [] },
    });
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [commerce, gfPolluted]);
    expect(communityMessengerRoomIsConfirmedTrade(commerce)).toBe(true);
    expect(communityMessengerRoomIsConfirmedTrade(gfPolluted)).toBe(false);
    expect(gfPolluted.contextMeta?.kind).toBeUndefined();
  });

  it("B: item_trade ledger link assigns minimal trade context", async () => {
    const ledgerRoom = room({
      id: "room-ledger",
      messengerDirectKey: null,
    });
    const sb = mockSb({
      product_chats: { data: [] },
      chat_rooms: {
        data: [
          {
            id: "ledger-chat",
            item_id: "post-ledger",
            community_messenger_room_id: "room-ledger",
          },
        ],
      },
    });
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [ledgerRoom]);
    expect(communityMessengerRoomIsConfirmedTrade(ledgerRoom)).toBe(true);
    expect(ledgerRoom.contextMeta?.productChatId).toBe("ledger-chat");
  });

  it("C: true general direct without commerce link stays non-trade", async () => {
    const general = room({
      id: "general-1",
      messengerDirectKey: `${VIEWER}:${PEER}`,
      peerUserId: PEER,
    });
    const sb = mockSb({
      product_chats: { data: [] },
      chat_rooms: { data: [] },
    });
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [general]);
    expect(communityMessengerRoomIsConfirmedTrade(general)).toBe(false);
    expect(general.contextMeta?.kind).toBeUndefined();
  });

  it("B: product_chats FK without post_id still assigns trade on non-GF room", async () => {
    const legacy = room({
      id: "room-no-post",
      messengerDirectKey: null,
    });
    const sb = mockSb({
      product_chats: {
        data: [
          {
            id: "pc-no-post",
            post_id: null,
            community_messenger_room_id: "room-no-post",
          },
        ],
      },
      chat_rooms: { data: [] },
    });
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [legacy]);
    expect(communityMessengerRoomIsConfirmedTrade(legacy)).toBe(true);
    expect(legacy.contextMeta).toMatchObject({
      v: 1,
      kind: "trade",
      productChatId: "pc-no-post",
    });
    expect(legacy.contextMeta?.postId).toBeUndefined();
  });

  it("E: general friend direct must NOT receive trade from orphan peer-pair product_chat", async () => {
    const gf = room({
      id: "room-gf",
      messengerDirectKey: `${VIEWER}:${PEER}`,
      peerUserId: PEER,
    });
    const sb = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data:
                table === "product_chats"
                  ? [
                      {
                        id: "pc-peer",
                        post_id: "post-peer",
                        seller_id: VIEWER,
                        buyer_id: PEER,
                        updated_at: "2026-01-02T00:00:00.000Z",
                        community_messenger_room_id: "",
                      },
                    ]
                  : [],
            }),
          }),
          in: async () => ({ data: [] }),
        }),
      }),
    };
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [gf]);
    expect(communityMessengerRoomIsConfirmedTrade(gf)).toBe(false);
    expect(gf.contextMeta?.kind).toBeUndefined();
  });

  it("does not steal product_chat already linked to another CM room via peer-pair fallback", async () => {
    const friend = room({
      id: "friend-room",
      messengerDirectKey: `${VIEWER}:${PEER}`,
      peerUserId: PEER,
    });
    const sb = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data:
                table === "product_chats"
                  ? [
                      {
                        id: "pc-trade-other",
                        post_id: "post-other",
                        seller_id: VIEWER,
                        buyer_id: PEER,
                        updated_at: "2026-01-02T00:00:00.000Z",
                        community_messenger_room_id: "trade-room-other",
                      },
                    ]
                  : [],
            }),
          }),
          in: async () => ({ data: [] }),
        }),
      }),
    };
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [friend]);
    expect(communityMessengerRoomIsConfirmedTrade(friend)).toBe(false);
  });

  it("does not assign orphan peer-pair trade when multiple general friend rooms share the peer", async () => {
    const tradeRoom = room({
      id: "trade-room",
      messengerDirectKey: `${VIEWER}:${PEER}`,
      peerUserId: PEER,
    });
    const friendRoom = room({
      id: "friend-room",
      messengerDirectKey: `${VIEWER}:${PEER}`,
      peerUserId: PEER,
    });
    const sb = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data:
                table === "product_chats"
                  ? [
                      {
                        id: "pc-orphan",
                        post_id: "post-orphan",
                        seller_id: VIEWER,
                        buyer_id: PEER,
                        updated_at: "2026-01-02T00:00:00.000Z",
                        community_messenger_room_id: "",
                      },
                    ]
                  : [],
            }),
          }),
          in: async () => ({ data: [] }),
        }),
      }),
    };
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [tradeRoom, friendRoom]);
    const tradeCount = [tradeRoom, friendRoom].filter((r) => communityMessengerRoomIsConfirmedTrade(r)).length;
    expect(tradeCount).toBe(0);
  });

  it("D: Run1/Run2 fixture — defer path matches post-enrich classification on commerce room", async () => {
    const run1Shape = room({
      id: "room-run1",
      messengerDirectKey: "trade_pc:pc-run",
      contextMeta: undefined,
    });
    const sb = mockSb({
      product_chats: {
        data: [
          {
            id: "pc-run",
            post_id: "post-run",
            community_messenger_room_id: "room-run1",
          },
        ],
      },
      chat_rooms: { data: [] },
    });
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [run1Shape]);
    const run2Shape = room({
      id: "room-run1",
      messengerDirectKey: "trade_pc:pc-run",
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-run", postId: "post-run" },
    });
    expect(communityMessengerRoomIsConfirmedTrade(run1Shape)).toBe(true);
    expect(communityMessengerRoomIsConfirmedTrade(run1Shape)).toBe(
      communityMessengerRoomIsConfirmedTrade(run2Shape)
    );
  });

  it("trade_pc direct key is confirmed trade via directKey without contextMeta", async () => {
    const keyed = room({
      id: "room-keyed",
      messengerDirectKey: "trade_pc:pc-key",
    });
    expect(communityMessengerRoomIsConfirmedTrade(keyed)).toBe(true);
  });

  // === Tier parity (lite == critical == full via shared classifier) ===
  // lite bootstrap 도 critical/full 과 동일한 이 함수를 호출하므로 분류 결과가 tier 에 무관하게 같아야 한다.
  // 아래는 §7 "delivery/group → trade enrich 영향 없음" · normal friend direct 유지 계약.

  it("parity: delivery(store_order) direct room stays delivery even with peer-pair product_chat", async () => {
    const delivery = room({
      id: "room-delivery",
      messengerDirectKey: `${VIEWER}:${PEER}`,
      peerUserId: PEER,
      contextMeta: { v: 1, kind: "delivery" },
    });
    const sb = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data:
                table === "product_chats"
                  ? [
                      {
                        id: "pc-should-not-apply",
                        post_id: "post-x",
                        seller_id: VIEWER,
                        buyer_id: PEER,
                        updated_at: "2026-01-02T00:00:00.000Z",
                        community_messenger_room_id: "",
                      },
                    ]
                  : [],
            }),
          }),
          in: async () => ({ data: [] }),
        }),
      }),
    };
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [delivery]);
    expect(delivery.contextMeta?.kind).toBe("delivery");
  });

  it("parity: group room (non-direct) is never touched by classifier", async () => {
    const group = room({
      id: "room-group",
      roomType: "open_group",
      peerUserId: null,
      messengerDirectKey: null,
    });
    const sb = mockSb({
      product_chats: {
        data: [{ id: "pc-group", post_id: "post-g", community_messenger_room_id: "room-group" }],
      },
      chat_rooms: { data: [] },
    });
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [group]);
    expect(group.contextMeta?.kind).toBeUndefined();
    expect(communityMessengerRoomIsConfirmedTrade(group)).toBe(false);
  });

  it("parity: commerce direct_key friend is excluded from Phase D orphan fallback", async () => {
    const commerce = room({
      id: "room-commerce",
      messengerDirectKey: "store_order:so-1",
      peerUserId: PEER,
    });
    const sb = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data:
                table === "product_chats"
                  ? [
                      {
                        id: "pc-orphan-commerce",
                        post_id: "post-c",
                        seller_id: VIEWER,
                        buyer_id: PEER,
                        updated_at: "2026-01-02T00:00:00.000Z",
                        community_messenger_room_id: "",
                      },
                    ]
                  : [],
            }),
          }),
          in: async () => ({ data: [] }),
        }),
      }),
    };
    await enrichTradeRoomClassificationForDeferredHomeSync(sb, VIEWER, [commerce]);
    // commerce direct_key 는 Phase D 대상 제외 → orphan product_chat 로 trade 오염되지 않아야 한다.
    expect(commerce.contextMeta?.kind).not.toBe("trade");
  });
});
