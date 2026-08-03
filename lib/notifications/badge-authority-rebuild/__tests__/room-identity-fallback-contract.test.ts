/**
 * Gate 3 Step 12 — Room Identity Fallback / Quarantine contract.
 */
import { describe, expect, it } from "vitest";
import {
  generalDirectRoomIdentity,
  tradeRoomIdentity,
} from "@/lib/chat-domain/room-identity";
import {
  isRoomUuidFallbackIdentityKey,
  normalizeConversationRoomsForAuthority,
  resolveCanonicalConversationRoomIdentity,
} from "@/lib/notifications/badge-authority-rebuild/canonical-conversation-room-identity";
import {
  conversationRoomsFromParticipantFactsNormalized,
} from "@/lib/notifications/badge-authority-rebuild/conversation-b-from-participant-facts";
import {
  projectSurfacesFromConversationAuthority,
  resolveMemberConversationAuthority,
  type MemberConversationRoomInput,
} from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import { resolveMemberAppIconAuthority } from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import { assertMissedCallXorWithConversationB } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";

const MEMBER = "member-aaa";
const PEER = "peer-bbb";

function room(
  partial: Partial<MemberConversationRoomInput> &
    Pick<MemberConversationRoomInput, "roomId" | "chatDomain" | "unreadMessageCount">
): MemberConversationRoomInput {
  return { memberId: MEMBER, leftAt: null, deletedAt: null, ...partial };
}

describe("Gate3 Step12 Room Identity Fallback", () => {
  it("General canonical identity deterministic; participant order does not change identity", () => {
    const a = generalDirectRoomIdentity(MEMBER, PEER).identityKey;
    const b = generalDirectRoomIdentity(PEER, MEMBER).identityKey;
    expect(a).toBe(b);
    const r1 = resolveCanonicalConversationRoomIdentity(
      room({
        roomId: "r1",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        peerUserId: PEER,
      }),
      MEMBER
    );
    const r2 = resolveCanonicalConversationRoomIdentity(
      room({
        roomId: "r1",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: a,
      }),
      MEMBER
    );
    expect(r1.status).toBe("adapted");
    expect(r1.domainIdentityKey).toBe(a);
    expect(r2.status).toBe("canonical");
    expect(r2.domainIdentityKey).toBe(a);
  });

  it("Group requires groupId (roomId OK as groupId)", () => {
    const ok = resolveCanonicalConversationRoomIdentity(
      room({
        roomId: "g1",
        chatDomain: "group",
        unreadMessageCount: 1,
        groupId: "g1",
      }),
      MEMBER
    );
    expect(ok.status).toBe("adapted");
    expect(ok.domainIdentityKey).toBe("group:g1");

    const missing = resolveCanonicalConversationRoomIdentity(
      room({
        roomId: "",
        chatDomain: "group",
        unreadMessageCount: 1,
      }),
      MEMBER
    );
    expect(missing.status).toBe("quarantined");
  });

  it("Trade requires listingId/sellerId/counterpartyId", () => {
    const key = tradeRoomIdentity({
      itemId: "L1",
      sellerId: "s1",
      buyerId: "c1",
    }).identityKey;
    expect(
      resolveCanonicalConversationRoomIdentity(
        room({
          roomId: "tr1",
          chatDomain: "trade",
          unreadMessageCount: 1,
          listingId: "L1",
          sellerId: "s1",
          counterpartyId: "c1",
        }),
        MEMBER
      ).domainIdentityKey
    ).toBe(key);

    const q = resolveCanonicalConversationRoomIdentity(
      room({ roomId: "tr1", chatDomain: "trade", unreadMessageCount: 1 }),
      MEMBER
    );
    expect(q.status).toBe("quarantined");
    expect(q.reason).toBe("TRADE_PARTICIPANT_AMBIGUOUS");
  });

  it("Order requires orderId; Owner requires store+order and stays out of Member B", () => {
    const orderOk = resolveCanonicalConversationRoomIdentity(
      room({
        roomId: "or1",
        chatDomain: "store_order_customer",
        unreadMessageCount: 1,
        orderId: "ord-1",
      }),
      MEMBER
    );
    expect(orderOk.status).toBe("adapted");
    expect(orderOk.domainIdentityKey).toBe("store_order:ord-1");

    const owner = resolveCanonicalConversationRoomIdentity(
      room({
        roomId: "or1",
        chatDomain: "store_order_owner",
        unreadMessageCount: 1,
        orderId: "ord-1",
      }),
      MEMBER
    );
    expect(owner.status).toBe("quarantined");
    expect(owner.reason).toBe("OWNER_IN_MEMBER_B");
  });

  it("room UUID alone is not canonical; *:room:{uuid} cannot enter B", () => {
    expect(isRoomUuidFallbackIdentityKey(`general_direct:room:uuid-1`)).toBe(true);
    expect(isRoomUuidFallbackIdentityKey(`trade:room:uuid-1`)).toBe(true);
    expect(isRoomUuidFallbackIdentityKey(`store_order:room:uuid-1`)).toBe(true);

    const normalized = normalizeConversationRoomsForAuthority(MEMBER, [
      room({
        roomId: "uuid-1",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: `general_direct:room:uuid-1`,
      }),
      room({
        roomId: "uuid-2",
        chatDomain: "trade",
        unreadMessageCount: 1,
        domainIdentityKey: `trade:room:uuid-2`,
      }),
    ]);
    expect(normalized.rooms).toHaveLength(0);
    expect(normalized.identityIncompleteCount).toBe(2);

    const auth = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "uuid-1",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: `general_direct:room:uuid-1`,
      }),
    ]);
    expect(auth.totalUnreadRooms).toBe(0);
    expect(auth.rooms).toHaveLength(0);
  });

  it("safely reconstructable legacy row becomes adapted; unrecoverable quarantined", () => {
    const adapted = resolveCanonicalConversationRoomIdentity(
      room({
        roomId: "r-old",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: `general_direct:room:r-old`,
        peerUserId: PEER,
      }),
      MEMBER
    );
    expect(adapted.status).toBe("adapted");
    expect(adapted.domainIdentityKey).toBe(
      generalDirectRoomIdentity(MEMBER, PEER).identityKey
    );

    const quarantined = resolveCanonicalConversationRoomIdentity(
      room({
        roomId: "r-old",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: `general_direct:room:r-old`,
      }),
      MEMBER
    );
    expect(quarantined.status).toBe("quarantined");
    expect(quarantined.reason).toBe("ROOM_UUID_FALLBACK");
  });

  it("quarantined row does not affect row/parent/B surfaces", () => {
    const bags = conversationRoomsFromParticipantFactsNormalized({
      memberId: MEMBER,
      generalDirect: [
        {
          roomId: "good",
          unreadMessageCount: 1,
          domainIdentityKey: generalDirectRoomIdentity(MEMBER, PEER).identityKey,
        },
        {
          roomId: "bad",
          unreadMessageCount: 9,
          domainIdentityKey: `general_direct:room:bad`,
        },
      ],
      group: [],
      trade: [{ roomId: "t-bad", unreadMessageCount: 3 }],
      customerOrder: [{ roomId: "o-bad", unreadMessageCount: 2 }],
    });
    expect(bags.identityIncompleteCount).toBeGreaterThanOrEqual(2);
    const auth = resolveMemberConversationAuthority(MEMBER, bags.rooms);
    expect(auth.generalUnreadRooms).toBe(1);
    expect(auth.tradeUnreadRooms).toBe(0);
    expect(auth.orderUnreadRooms).toBe(0);
    expect(auth.totalUnreadRooms).toBe(1);
    const surfaces = projectSurfacesFromConversationAuthority(auth);
    expect(surfaces.bottomChat).toBe(1);
    expect(surfaces.tradeHub).toBe(0);
    expect(surfaces.orderHub).toBe(0);
  });

  it("Trade cannot enter General; Order cannot enter Trade; Owner cannot enter Member B", () => {
    const tradeAsGeneral = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "x",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: tradeRoomIdentity({
          itemId: "L",
          sellerId: "s",
          buyerId: "b",
        }).identityKey,
      }),
    ]);
    expect(tradeAsGeneral.totalUnreadRooms).toBe(0);

    const orderAsTrade = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "x",
        chatDomain: "trade",
        unreadMessageCount: 1,
        domainIdentityKey: "store_order:ord-9",
      }),
    ]);
    expect(orderAsTrade.totalUnreadRooms).toBe(0);

    const ownerInB = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "x",
        chatDomain: "store_order_owner",
        unreadMessageCount: 1,
        orderId: "ord-9",
      }),
    ]);
    expect(ownerInB.totalUnreadRooms).toBe(0);
  });

  it("Customer Order cannot enter Owner C path via Member B bags", () => {
    const bags = conversationRoomsFromParticipantFactsNormalized({
      memberId: MEMBER,
      generalDirect: [],
      group: [],
      trade: [],
      customerOrder: [
        {
          roomId: "or1",
          unreadMessageCount: 1,
          domainIdentityKey: "store_order:ord-1",
          orderId: "ord-1",
        },
      ],
      ownerOrder: [{ roomId: "or1", unreadMessageCount: 1 }],
    });
    const auth = resolveMemberConversationAuthority(MEMBER, bags.rooms);
    expect(auth.orderUnreadRooms).toBe(1);
    expect(auth.rooms.every((r) => r.chatDomain === "store_order_customer")).toBe(true);
  });

  it("canonical room-bound missed enters B; identity-incomplete missed does not enter A or B", () => {
    const gdKey = generalDirectRoomIdentity(MEMBER, PEER).identityKey;
    const b = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "call-room",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: gdKey,
        peerUserId: PEER,
      }),
    ]);
    expect(b.totalUnreadRooms).toBe(1);
    expect(
      assertMissedCallXorWithConversationB({
        authority: b,
        orphanMissedCallIds: ["orphan-sess"],
        roomBoundMissedCallIdsInRooms: ["call-room"],
      }).ok
    ).toBe(true);

    const incomplete = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "incomplete-room",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: `general_direct:room:incomplete-room`,
      }),
    ]);
    expect(incomplete.totalUnreadRooms).toBe(0);

    const a = resolveMemberNotificationAuthorityFromRows(
      [
        {
          id: "bound-incomplete",
          user_id: MEMBER,
          unread: true,
          read_at: null,
          type: "missed_call",
          category: "missed_call",
          room_id: "incomplete-room",
          dedupe_key: "missed:incomplete",
          display_payload: {},
        },
      ],
      MEMBER
    );
    // room-bound incomplete must not auto-enter A either
    expect(a.eventIds).not.toContain("bound-incomplete");
    expect(a.unreadCount).toBe(0);
  });

  it("A unchanged; App Icon = A+B of canonical rooms only", () => {
    const a = resolveMemberNotificationAuthorityFromRows(
      [
        {
          id: "n1",
          user_id: MEMBER,
          unread: true,
          read_at: null,
          type: "admin_notice",
          category: "admin_notice",
          dedupe_key: "admin:n1",
          display_payload: {},
        },
      ],
      MEMBER
    );
    const b = resolveMemberConversationAuthority(MEMBER, [
      room({
        roomId: "good",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, PEER).identityKey,
      }),
      room({
        roomId: "bad",
        chatDomain: "trade",
        unreadMessageCount: 5,
        domainIdentityKey: `trade:room:bad`,
      }),
    ]);
    expect(b.totalUnreadRooms).toBe(1);
    const icon = resolveMemberAppIconAuthority({
      notificationA: a,
      conversationB: b,
      revision: 1,
    });
    expect(icon.appIconTotal).toBe(a.unreadCount + b.totalUnreadRooms);
  });
});
