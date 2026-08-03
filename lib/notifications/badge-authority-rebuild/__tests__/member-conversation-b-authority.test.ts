/**
 * Gate 3 Step 5 — Conversation Authority B contract (must PASS).
 */
import { describe, expect, it } from "vitest";
import {
  applyIncomingMessageToConversationRooms,
  applyReadAckToConversationRooms,
  assertMissedCallXorWithConversationB,
  projectSurfacesFromConversationAuthority,
  resolveMemberConversationAuthority,
  sumUnreadMessages,
  type MemberConversationRoomInput,
} from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import {
  buildMemberNotificationAProjection,
  deriveMemberUnreadNotificationCount,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import { gate2ASetsEqual, snapshotAuthorityASets } from "@/lib/notifications/badge-authority-rebuild/authority-a-set-heads";
import { generalDirectRoomIdentity, tradeRoomIdentity } from "@/lib/chat-domain/room-identity";

const MEMBER = "member-1";

function room(
  partial: Partial<MemberConversationRoomInput> &
    Pick<MemberConversationRoomInput, "roomId" | "chatDomain" | "unreadMessageCount">
): MemberConversationRoomInput {
  return {
    memberId: MEMBER,
    leftAt: null,
    deletedAt: null,
    ...partial,
  };
}

describe("Gate3 Step5 Conversation Authority B", () => {
  it("room 0→1 increments domain room count once; 1→2 does not", () => {
    let rooms: MemberConversationRoomInput[] = [];
    rooms = applyIncomingMessageToConversationRooms(MEMBER, rooms, {
      roomId: "r-gd",
      messageId: "m1",
      senderId: "peer",
      chatDomain: "general_direct",
      domainIdentityKey: generalDirectRoomIdentity(MEMBER, "peer").identityKey,
      peerUserId: "peer",
    });
    let auth = resolveMemberConversationAuthority(MEMBER, rooms);
    expect(auth.generalUnreadRooms).toBe(1);
    expect(auth.totalUnreadRooms).toBe(1);
    expect(auth.rooms[0]?.unreadMessageCount).toBe(1);

    rooms = applyIncomingMessageToConversationRooms(MEMBER, rooms, {
      roomId: "r-gd",
      messageId: "m2",
      senderId: "peer",
      chatDomain: "general_direct",
      domainIdentityKey: generalDirectRoomIdentity(MEMBER, "peer").identityKey,
      peerUserId: "peer",
    });
    auth = resolveMemberConversationAuthority(MEMBER, rooms);
    expect(auth.rooms[0]?.unreadMessageCount).toBe(2);
    expect(auth.generalUnreadRooms).toBe(1);
    expect(auth.totalUnreadRooms).toBe(1);
  });

  it("second room 0→1 increments domain room count", () => {
    let rooms: MemberConversationRoomInput[] = [
      room({
        roomId: "r1",
        chatDomain: "general_direct",
        unreadMessageCount: 2,
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "p1").identityKey,
        peerUserId: "p1",
      }),
    ];
    rooms = applyIncomingMessageToConversationRooms(MEMBER, rooms, {
      roomId: "r2",
      messageId: "x1",
      senderId: "p2",
      chatDomain: "general_direct",
      domainIdentityKey: generalDirectRoomIdentity(MEMBER, "p2").identityKey,
      peerUserId: "p2",
    });
    const auth = resolveMemberConversationAuthority(MEMBER, rooms);
    expect(auth.generalUnreadRooms).toBe(2);
    expect(auth.totalUnreadRooms).toBe(2);
  });

  it("room N→0 decrements domain room count once; repeated read ACK idempotent", () => {
    let rooms: MemberConversationRoomInput[] = [
      room({
        roomId: "r1",
        chatDomain: "group",
        unreadMessageCount: 5,
        domainIdentityKey: "group:g1",
        groupId: "g1",
      }),
    ];
    expect(resolveMemberConversationAuthority(MEMBER, rooms).groupUnreadRooms).toBe(1);
    rooms = applyReadAckToConversationRooms(rooms, {
      roomId: "r1",
      lastReadMessageId: "tip",
      serverAckOk: true,
    });
    let auth = resolveMemberConversationAuthority(MEMBER, rooms);
    expect(auth.rooms.find((r) => r.roomId === "r1")?.unreadMessageCount).toBe(0);
    expect(auth.groupUnreadRooms).toBe(0);
    expect(auth.totalUnreadRooms).toBe(0);

    rooms = applyReadAckToConversationRooms(rooms, {
      roomId: "r1",
      lastReadMessageId: "tip",
      serverAckOk: true,
    });
    auth = resolveMemberConversationAuthority(MEMBER, rooms);
    expect(auth.groupUnreadRooms).toBe(0);
    expect(auth.totalUnreadRooms).toBe(0);
  });

  it("failed server ACK does not clear unread", () => {
    const rooms = [
      room({
        roomId: "r1",
        chatDomain: "trade",
        unreadMessageCount: 3,
        domainIdentityKey: tradeRoomIdentity({
          itemId: "L1",
          sellerId: "s1",
          buyerId: "b1",
        }).identityKey,
        listingId: "L1",
        sellerId: "s1",
        counterpartyId: "b1",
      }),
    ];
    const after = applyReadAckToConversationRooms(rooms, {
      roomId: "r1",
      lastReadMessageId: "m",
      serverAckOk: false,
    });
    expect(resolveMemberConversationAuthority(MEMBER, after).tradeUnreadRooms).toBe(1);
  });

  it("duplicate message apply still one room; sender own message does not increment", () => {
    let rooms: MemberConversationRoomInput[] = [];
    const key = generalDirectRoomIdentity(MEMBER, "peer").identityKey;
    rooms = applyIncomingMessageToConversationRooms(MEMBER, rooms, {
      roomId: "r1",
      messageId: "m1",
      senderId: "peer",
      chatDomain: "general_direct",
      domainIdentityKey: key,
      peerUserId: "peer",
    });
    // replay same delivery shape — increments once more at message layer (1→2), room count stays 1
    rooms = applyIncomingMessageToConversationRooms(MEMBER, rooms, {
      roomId: "r1",
      messageId: "m1-dup-delivery",
      senderId: "peer",
      chatDomain: "general_direct",
      domainIdentityKey: key,
      peerUserId: "peer",
    });
    expect(resolveMemberConversationAuthority(MEMBER, rooms).generalUnreadRooms).toBe(1);

    const before = resolveMemberConversationAuthority(MEMBER, rooms).totalUnreadRooms;
    const noSenderBump = applyIncomingMessageToConversationRooms(MEMBER, rooms, {
      roomId: "r1",
      messageId: "mine",
      senderId: MEMBER,
      chatDomain: "general_direct",
      domainIdentityKey: key,
      peerUserId: "peer",
    });
    expect(resolveMemberConversationAuthority(MEMBER, noSenderBump).totalUnreadRooms).toBe(
      before
    );
    expect(
      noSenderBump.find((r) => r.roomId === "r1")?.unreadMessageCount
    ).toBe(rooms.find((r) => r.roomId === "r1")?.unreadMessageCount);
  });

  it("duplicate domainIdentityKey counted once", () => {
    const key = generalDirectRoomIdentity(MEMBER, "peer").identityKey;
    const auth = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "alias-a",
        chatDomain: "general_direct",
        unreadMessageCount: 4,
        domainIdentityKey: key,
        peerUserId: "peer",
      }),
      room({
        roomId: "alias-b",
        chatDomain: "general_direct",
        unreadMessageCount: 9,
        domainIdentityKey: key,
        peerUserId: "peer",
      }),
    ]);
    expect(auth.generalUnreadRooms).toBe(1);
    expect(auth.rooms).toHaveLength(1);
    expect(auth.rooms[0]?.unreadMessageCount).toBe(4);
  });

  it("General and Trade between same users remain separate", () => {
    const gd = generalDirectRoomIdentity(MEMBER, "peer").identityKey;
    const trade = tradeRoomIdentity({
      itemId: "item-1",
      sellerId: MEMBER,
      buyerId: "peer",
    }).identityKey;
    expect(gd).not.toBe(trade);
    const auth = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "gd1",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: gd,
        peerUserId: "peer",
      }),
      room({
        roomId: "tr1",
        chatDomain: "trade",
        unreadMessageCount: 1,
        domainIdentityKey: trade,
        listingId: "item-1",
        sellerId: MEMBER,
        counterpartyId: "peer",
      }),
    ]);
    expect(auth.generalUnreadRooms).toBe(1);
    expect(auth.tradeUnreadRooms).toBe(1);
    expect(auth.totalUnreadRooms).toBe(2);
  });

  it("Trade and Order remain separate; Customer vs Owner order", () => {
    const auth = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "tr1",
        chatDomain: "trade",
        unreadMessageCount: 2,
        domainIdentityKey: "trade:L:s:c",
        listingId: "L",
        sellerId: "s",
        counterpartyId: "c",
      }),
      room({
        roomId: "so-c",
        chatDomain: "store_order_customer",
        unreadMessageCount: 3,
        domainIdentityKey: "store_order:o1",
        orderId: "o1",
      }),
      room({
        roomId: "so-o",
        chatDomain: "store_order_owner",
        unreadMessageCount: 8,
        domainIdentityKey: "store_order:o1",
        orderId: "o1",
      }),
    ]);
    expect(auth.tradeUnreadRooms).toBe(1);
    expect(auth.orderUnreadRooms).toBe(1);
    expect(auth.totalUnreadRooms).toBe(2);
    expect(auth.rooms.some((r) => r.roomId === "so-o")).toBe(false);
  });

  it("different member / left / deleted excluded", () => {
    const auth = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "ok",
        chatDomain: "group",
        unreadMessageCount: 1,
        domainIdentityKey: "group:g-ok",
        groupId: "g-ok",
      }),
      room({
        roomId: "other",
        chatDomain: "group",
        unreadMessageCount: 1,
        domainIdentityKey: "group:g-other",
        groupId: "g-other",
        memberId: "other-member",
      }),
      room({
        roomId: "left",
        chatDomain: "group",
        unreadMessageCount: 1,
        domainIdentityKey: "group:g-left",
        groupId: "g-left",
        leftAt: "2026-01-01T00:00:00.000Z",
      }),
      room({
        roomId: "del",
        chatDomain: "group",
        unreadMessageCount: 1,
        domainIdentityKey: "group:g-del",
        groupId: "g-del",
        deletedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    expect(auth.groupUnreadRooms).toBe(1);
    expect(auth.rooms.map((r) => r.roomId)).toEqual(["ok"]);
  });

  it("Bottom/Trade/Order projections equal domain room counts; row ≠ parent sum", () => {
    const rooms = [
      room({
        roomId: "g1",
        chatDomain: "general_direct",
        unreadMessageCount: 20,
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "a").identityKey,
        peerUserId: "a",
      }),
      room({
        roomId: "grp",
        chatDomain: "group",
        unreadMessageCount: 3,
        domainIdentityKey: "group:g9",
        groupId: "g9",
      }),
      room({
        roomId: "t1",
        chatDomain: "trade",
        unreadMessageCount: 7,
        domainIdentityKey: "trade:i:s:b",
        listingId: "i",
        sellerId: "s",
        counterpartyId: "b",
      }),
      room({
        roomId: "o1",
        chatDomain: "store_order_customer",
        unreadMessageCount: 4,
        domainIdentityKey: "store_order:99",
        orderId: "99",
      }),
    ];
    const auth = resolveMemberConversationAuthority(MEMBER, rooms);
    const surfaces = projectSurfacesFromConversationAuthority(auth);
    // Bottom Chat = 일반+그룹+거래+주문(고객) room count
    expect(surfaces.bottomChat).toBe(
      auth.generalUnreadRooms +
        auth.groupUnreadRooms +
        auth.tradeUnreadRooms +
        auth.orderUnreadRooms
    );
    expect(surfaces.bottomChat).toBe(4);
    expect(surfaces.tradeHub).toBe(auth.tradeUnreadRooms);
    expect(surfaces.tradeHub).toBe(1);
    expect(surfaces.orderHub).toBe(auth.orderUnreadRooms);
    expect(surfaces.orderHub).toBe(1);
    expect(surfaces.conversationB).toBe(4);
    expect(auth.rooms.find((r) => r.roomId === "g1")?.unreadMessageCount).toBe(20);
    expect(sumUnreadMessages(auth)).toBe(20 + 3 + 7 + 4);
    expect(auth.totalUnreadRooms).not.toBe(sumUnreadMessages(auth));
  });

  it("room-bound missed only via B room unread; orphan excluded from B", () => {
    const rooms = [
      room({
        roomId: "call-room",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "caller").identityKey,
        peerUserId: "caller",
        includesRoomBoundMissedCall: true,
      }),
    ];
    const auth = resolveMemberConversationAuthority(MEMBER, rooms);
    expect(auth.totalUnreadRooms).toBe(1);
    const xor = assertMissedCallXorWithConversationB({
      orphanMissedCallIds: ["orphan-sess"],
      authority: auth,
      roomBoundMissedCallIdsInRooms: ["bound-sess"],
    });
    expect(xor.ok).toBe(true);
    expect(
      assertMissedCallXorWithConversationB({
        orphanMissedCallIds: ["same-sess"],
        authority: auth,
        roomBoundMissedCallIdsInRooms: ["same-sess"],
      }).ok
    ).toBe(false);
    // orphan-only facts are not rooms → B stays 0
    expect(resolveMemberConversationAuthority(MEMBER, []).totalUnreadRooms).toBe(0);
  });

  it("A event set unchanged by B mutations", () => {
    const aRows = [
      {
        id: "evt-a",
        type: "trade_status",
        category: "trade_status",
        unread: true,
        read_at: null,
        dedupe_key: "trade_status:p1:v1",
        display_payload: { legacyMeta: { product_id: "prod-1" } },
      },
      {
        id: "evt-b",
        type: "admin_notice",
        category: "admin_notice",
        unread: true,
        read_at: null,
        dedupe_key: "admin:n1",
        display_payload: {},
      },
    ];
    const beforeSnap = snapshotAuthorityASets(aRows, MEMBER);
    const beforeCount = deriveMemberUnreadNotificationCount(aRows, MEMBER);

    let rooms: MemberConversationRoomInput[] = [];
    rooms = applyIncomingMessageToConversationRooms(MEMBER, rooms, {
      roomId: "r1",
      messageId: "m1",
      senderId: "peer",
      chatDomain: "general_direct",
      domainIdentityKey: generalDirectRoomIdentity(MEMBER, "peer").identityKey,
      peerUserId: "peer",
    });
    resolveMemberConversationAuthority(MEMBER, rooms);
    rooms = applyReadAckToConversationRooms(rooms, {
      roomId: "r1",
      lastReadMessageId: "m1",
      serverAckOk: true,
    });
    resolveMemberConversationAuthority(MEMBER, rooms);

    const afterSnap = snapshotAuthorityASets(aRows, MEMBER);
    expect(gate2ASetsEqual(beforeSnap)).toBe(true);
    expect(afterSnap.digitEventIds).toEqual(beforeSnap.digitEventIds);
    expect(deriveMemberUnreadNotificationCount(aRows, MEMBER)).toBe(beforeCount);
    expect(buildMemberNotificationAProjection(aRows, MEMBER).eventIds).toEqual(
      beforeSnap.digitEventIds
    );
  });

  it("authorityVersion and computedAt present", () => {
    const auth = resolveMemberConversationAuthority(
      MEMBER,
      [
        room({
          roomId: "r1",
          chatDomain: "group",
          unreadMessageCount: 1,
          domainIdentityKey: "group:g1",
          groupId: "g1",
        }),
      ],
      { computedAt: "2026-08-03T00:00:00.000Z" }
    );
    expect(auth.memberKey).toBe(`user:${MEMBER}`);
    expect(auth.computedAt).toBe("2026-08-03T00:00:00.000Z");
    expect(auth.authorityVersion.startsWith("2026-08-03")).toBe(true);
  });
});
