/**
 * Gate 3 Step 7 — Store Owner Authority C contract (must PASS).
 */
import { describe, expect, it } from "vitest";
import {
  activeStoreOwnerAuthority,
  assertMemberAIgnoresStoreKey,
  assertNewOrderExcludedFromMemberA,
  assertOwnerCExcludedFromMemberAppIcon,
  assertOwnerChatExcludedFromMemberB,
  assertOwnerCForbidsUserIdentity,
  assertOwnerPushRecipientStore,
  forbidSumOwnerCAcrossStores,
  projectOwnerOrderRowUnread,
  projectOwnerSurfacesFromAuthority,
  resolveStoreOwnerAuthoritiesByStore,
  resolveStoreOwnerAuthority,
} from "@/lib/notifications/badge-authority-rebuild/store-owner-c-authority";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import { resolveMemberConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import { resolveMemberAppIconAuthority } from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import { publishMemberAppIconAuthority } from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import { generalDirectRoomIdentity } from "@/lib/chat-domain/room-identity";
import { gate2ASetsEqual, snapshotAuthorityASets } from "@/lib/notifications/badge-authority-rebuild/authority-a-set-heads";

const OWNER = "owner-user-1";
const STORE_A = "store-aaa";
const STORE_B = "store-bbb";
const MEMBER = "member-buyer-1";

const emptyOps = {
  pendingOrderActions: 0,
  refundActions: 0,
  cancelActions: 0,
  openInquiryActions: 0,
};

describe("Gate3 Step7 Store Owner Authority C", () => {
  it("resolves C_operational + C_chat under store:{storeId}", () => {
    const auth = resolveStoreOwnerAuthority({
      storeId: STORE_A,
      operational: {
        pendingOrderActions: 2,
        refundActions: 1,
        cancelActions: 0,
        openInquiryActions: 3,
      },
      chatRooms: [
        {
          roomId: "or1",
          storeId: STORE_A,
          unreadMessageCount: 5,
          orderId: "o1",
          domainIdentityKey: "store_order:o1",
        },
        {
          roomId: "or2",
          storeId: STORE_A,
          unreadMessageCount: 2,
          orderId: "o2",
          domainIdentityKey: "store_order:o2",
        },
      ],
      revision: 10,
    });
    expect(auth).not.toBeNull();
    expect(auth!.storeKey).toBe(`store:${STORE_A}`);
    expect(auth!.cOperational).toBe(2 + 1 + 0 + 3);
    expect(auth!.cChat).toBe(2);
    expect(auth!.ownerFabOrders).toBe(3);
    expect(auth!.ownerFabStore).toBe(3);
    expect(auth!.ownerFabOrderChat).toBe(2);
    expect(auth!.adminHubOperational).toBe(auth!.cOperational);
    expect(auth!.adminHubChat).toBe(2);
    expect(projectOwnerOrderRowUnread(auth!, "or1")).toBe(5);
    expect(projectOwnerOrderRowUnread(auth!, "or1")).not.toBe(auth!.cChat);
    const surfaces = projectOwnerSurfacesFromAuthority(auth!);
    expect(surfaces.adminHubOperational).toBe(6);
    expect(surfaces.ownerFabOrderChat).toBe(2);
    expect(auth!.authorityVersion.startsWith("c1|10|")).toBe(true);
  });

  it("same userId multiple stores fully isolated; forbid cross-store sum", () => {
    const by = resolveStoreOwnerAuthoritiesByStore({
      storeIds: [STORE_A, STORE_B],
      operationalByStoreId: {
        [STORE_A]: { ...emptyOps, pendingOrderActions: 4 },
        [STORE_B]: { ...emptyOps, pendingOrderActions: 1, openInquiryActions: 2 },
      },
      ownerChatUnreadByStoreId: { [STORE_A]: 3, [STORE_B]: 1 },
      revision: 1,
    });
    expect(by[STORE_A]?.cOperational).toBe(4);
    expect(by[STORE_B]?.cOperational).toBe(3);
    expect(by[STORE_A]?.cChat).toBe(3);
    expect(by[STORE_B]?.cChat).toBe(1);
    expect(activeStoreOwnerAuthority(by, STORE_A)?.cOperational).toBe(4);
    expect(activeStoreOwnerAuthority(by, STORE_B)?.cChat).toBe(1);
    expect(activeStoreOwnerAuthority(by, null)).toBeNull();
    expect(forbidSumOwnerCAcrossStores(by)).toBeNull();
    void OWNER;
  });

  it("new order / owner_intake excluded from Member A", () => {
    const newOrder = {
      id: "oi-1",
      type: "order_status",
      category: "order_status",
      unread: true,
      read_at: null,
      dedupe_key: "commerce:owner:new_order:ox",
      display_payload: {
        legacyMeta: { kind: "store_order_created", order_id: "ox", store_id: STORE_A },
      },
    };
    expect(assertNewOrderExcludedFromMemberA(newOrder).ok).toBe(true);
    const a = resolveMemberNotificationAuthorityFromRows([newOrder], OWNER);
    expect(a.unreadCount).toBe(0);
    expect(assertMemberAIgnoresStoreKey(a, `store:${STORE_A}`).ok).toBe(true);
  });

  it("owner customer messages excluded from Member Conversation B", () => {
    const ownerRoomId = "owner-so-room";
    const memberB = resolveMemberConversationAuthority(MEMBER, [
      {
        roomId: "cust-so",
        chatDomain: "store_order_customer",
        unreadMessageCount: 2,
        domainIdentityKey: "store_order:cust1",
        orderId: "cust1",
        memberId: MEMBER,
      },
      {
        roomId: "gd1",
        chatDomain: "general_direct",
        unreadMessageCount: 1,
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "peer").identityKey,
        peerUserId: "peer",
        memberId: MEMBER,
      },
    ]);
    expect(memberB.orderUnreadRooms).toBe(1);
    expect(assertOwnerChatExcludedFromMemberB({
      memberB,
      ownerRoomIds: [ownerRoomId],
    }).ok).toBe(true);
    // If owner room leaked into member B rooms → fail
    const leaked = resolveMemberConversationAuthority(MEMBER, [
      {
        roomId: ownerRoomId,
        chatDomain: "store_order_customer",
        unreadMessageCount: 1,
        domainIdentityKey: "store_order:owner-leak",
        orderId: "owner-leak",
        memberId: MEMBER,
      },
    ]);
    expect(
      assertOwnerChatExcludedFromMemberB({
        memberB: leaked,
        ownerRoomIds: [ownerRoomId],
      }).ok
    ).toBe(false);
  });

  it("Owner C does not enter Member App Icon A+B", () => {
    const a = resolveMemberNotificationAuthorityFromRows(
      [
        {
          id: "n1",
          type: "admin_notice",
          category: "admin_notice",
          unread: true,
          read_at: null,
          dedupe_key: "n1",
          display_payload: {},
        },
      ],
      MEMBER
    );
    const b = resolveMemberConversationAuthority(MEMBER, [
      {
        roomId: "gd1",
        chatDomain: "general_direct",
        unreadMessageCount: 2,
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "p").identityKey,
        peerUserId: "p",
        memberId: MEMBER,
      },
    ]);
    const appIcon = resolveMemberAppIconAuthority({
      notificationA: a,
      conversationB: b,
      revision: 5,
    });
    const ownerC = resolveStoreOwnerAuthority({
      storeId: STORE_A,
      operational: { ...emptyOps, pendingOrderActions: 9 },
      ownerChatUnreadRooms: 4,
      revision: 5,
    })!;
    expect(appIcon.appIconTotal).toBe(1 + 1);
    expect(assertOwnerCExcludedFromMemberAppIcon({ appIcon, ownerC }).ok).toBe(true);
    expect(
      publishMemberAppIconAuthority(appIcon, null, {
        ownerStoreOrderUnreadRooms: ownerC.cChat,
      }).ok
    ).toBe(false);
    expect(
      publishMemberAppIconAuthority(appIcon, null, {
        storeActionRequiredCount: ownerC.cOperational,
      }).ok
    ).toBe(false);
  });

  it("Owner push enters only matching store admin", () => {
    expect(
      assertOwnerPushRecipientStore({
        recipientStoreId: STORE_A,
        targetStoreId: STORE_A,
      }).ok
    ).toBe(true);
    expect(
      assertOwnerPushRecipientStore({
        recipientStoreId: STORE_A,
        targetStoreId: STORE_B,
      }).ok
    ).toBe(false);
    expect(
      assertOwnerPushRecipientStore({
        recipientStoreId: null,
        targetStoreId: STORE_A,
      }).ok
    ).toBe(false);
    expect(assertOwnerCForbidsUserIdentity(OWNER).reason).toBe(
      "C_STORE_FORBIDS_USER_IDENTITY"
    );
  });

  it("other store chat rooms excluded from this store C_chat", () => {
    const auth = resolveStoreOwnerAuthority({
      storeId: STORE_A,
      operational: emptyOps,
      chatRooms: [
        {
          roomId: "a1",
          storeId: STORE_A,
          unreadMessageCount: 1,
          domainIdentityKey: "store_order:a1",
        },
        {
          roomId: "b1",
          storeId: STORE_B,
          unreadMessageCount: 9,
          domainIdentityKey: "store_order:b1",
        },
      ],
    });
    expect(auth!.cChat).toBe(1);
    expect(auth!.rooms.map((r) => r.roomId)).toEqual(["a1"]);
  });

  it("A/B/App Icon non-regression alongside Owner C", () => {
    const aRows = [
      {
        id: "evt-a",
        type: "trade_status",
        category: "trade_status",
        unread: true,
        read_at: null,
        dedupe_key: "t1",
        display_payload: { legacyMeta: { product_id: "p" } },
      },
      {
        id: "evt-b",
        type: "admin_notice",
        category: "admin_notice",
        unread: true,
        read_at: null,
        dedupe_key: "n1",
        display_payload: {},
      },
    ];
    expect(gate2ASetsEqual(snapshotAuthorityASets(aRows, MEMBER))).toBe(true);
    const b = resolveMemberConversationAuthority(MEMBER, [
      {
        roomId: "g1",
        chatDomain: "group",
        unreadMessageCount: 4,
        domainIdentityKey: "group:g1",
        groupId: "g1",
        memberId: MEMBER,
      },
    ]);
    expect(b.totalUnreadRooms).toBe(1);
    expect(b.rooms[0]?.unreadMessageCount).toBe(4);
    resolveStoreOwnerAuthority({
      storeId: STORE_A,
      operational: { ...emptyOps, pendingOrderActions: 2 },
      ownerChatUnreadRooms: 1,
    });
    const icon = resolveMemberAppIconAuthority({
      notificationA: resolveMemberNotificationAuthorityFromRows(aRows, MEMBER),
      conversationB: b,
      revision: 1,
    });
    expect(icon.appIconTotal).toBe(2 + 1);
  });
});
