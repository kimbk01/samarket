/**
 * Phase 1 Authority Contract tests — target product contract only.
 * Does not import Projection Authority / Bell store / Native / FCM product paths.
 */
import { describe, expect, it } from "vitest";
import {
  BADGE_AUTHORITY_CONTRACT_VERSION,
  BADGE_EVENT_CLASSIFICATION_TABLE,
  PHASE_B_DOCUMENTED_CONTRACT_VIOLATIONS,
  applyCommunicationRoomRead,
  applyMemberAMarkAllRead,
  applyMissedCallSeen,
  applyOwnerOrderAccept,
  axesAreExclusive,
  bCommunicationItemCount,
  classifyBadgeContractEvent,
  fcmContractForPushKind,
  identitiesAreDistinct,
  isMemberAEligibleNotification,
  isOwnerIntakeAttentionKey,
  isOwnerStoreOperationMetaKind,
  memberBUnreadRoomCount,
  memberIdentityKey,
  ownerNewOrderDeepLinkTarget,
  projectBottomChatBadge,
  projectCustomerOrderHubBadge,
  projectMemberAppIconTotal,
  projectBellBadge,
  projectOwnerStoreSurfaces,
  projectOwnerSurfacesByStore,
  projectTradeHubBadge,
  storeBUnreadRoomCount,
  storeIdentityKey,
  uniqueUnreadRoomCount,
  unresolvedMissedCallCountFromCallIds,
  asUnreadMessageCount,
  asUnreadRoomCount,
  type BadgeContractEventKind,
} from "@/lib/notifications/badge-authority-rebuild/phase1-authority-contract";

describe("Phase 1 badge authority contract", () => {
  it("locks contract version", () => {
    expect(BADGE_AUTHORITY_CONTRACT_VERSION).toBe("badge_authority_rebuild_phase1_v1");
  });

  it("documents Phase B violations without treating them as PASS", () => {
    expect(PHASE_B_DOCUMENTED_CONTRACT_VIOLATIONS).toContain(
      "owner_intake_in_notification_attention_total"
    );
    expect(PHASE_B_DOCUMENTED_CONTRACT_VIOLATIONS).toContain(
      "store_new_order_written_as_user_id_notification_event"
    );
  });

  describe("event classification exclusivity", () => {
    const kinds = Object.keys(BADGE_EVENT_CLASSIFICATION_TABLE) as BadgeContractEventKind[];

    it.each(kinds)("%s has exclusive A/B/C axes", (kind) => {
      const row = classifyBadgeContractEvent(kind);
      expect(axesAreExclusive(row)).toBe(true);
      expect(row.A + row.B + row.C).toBeLessThanOrEqual(1);
    });

    it("owner_intake / store_new_order is C not A", () => {
      const row = classifyBadgeContractEvent("store_new_order");
      expect(row).toMatchObject({ A: 0, B: 0, C: 1, bell: 0, appIcon: 0 });
      expect(isOwnerIntakeAttentionKey("order_status:owner_intake:ord-1")).toBe(true);
      expect(isOwnerStoreOperationMetaKind("store_order_created")).toBe(true);
    });

    it("owner_intake is never member A / Bell eligible", () => {
      expect(
        isMemberAEligibleNotification({
          recipientScope: "member",
          recipientIdentityKey: memberIdentityKey("u1"),
          persistsInInbox: true,
          readAt: null,
          deletedAt: null,
          attentionKey: "order_status:owner_intake:ord-9",
        })
      ).toBe(false);
      expect(
        isMemberAEligibleNotification({
          recipientScope: "member",
          recipientIdentityKey: memberIdentityKey("u1"),
          persistsInInbox: true,
          readAt: null,
          deletedAt: null,
          metaKind: "store_order_created",
        })
      ).toBe(false);
    });

    it("customer→owner message is B not C", () => {
      expect(classifyBadgeContractEvent("customer_to_store_message")).toMatchObject({
        A: 0,
        B: 1,
        C: 0,
        bell: 0,
        appIcon: "B",
        defaultRecipientScope: "store",
      });
    });

    it("trade/order status are A; marketing is none; missed is B", () => {
      expect(classifyBadgeContractEvent("trade_status")).toMatchObject({
        A: 1,
        B: 0,
        C: 0,
        bell: "A",
        appIcon: "A",
      });
      expect(classifyBadgeContractEvent("customer_order_status")).toMatchObject({
        A: 1,
        bell: "A",
        appIcon: "A",
      });
      expect(classifyBadgeContractEvent("marketing_ephemeral")).toMatchObject({
        A: 0,
        B: 0,
        C: 0,
        bell: 0,
        appIcon: 0,
      });
      expect(classifyBadgeContractEvent("missed_call")).toMatchObject({
        A: 0,
        B: 1,
        C: 0,
        bell: 0,
        appIcon: "B",
      });
      expect(classifyBadgeContractEvent("service_notice")).toMatchObject({
        A: 1,
        bell: "A",
        appIcon: "A",
      });
    });
  });

  describe("identity", () => {
    it("separates user and store identity keys", () => {
      expect(memberIdentityKey("abc")).toBe("user:abc");
      expect(storeIdentityKey("abc")).toBe("store:abc");
      expect(identitiesAreDistinct("abc", "abc")).toBe(true);
      expect(memberIdentityKey("abc")).not.toBe(storeIdentityKey("abc"));
    });

    it("does not let user_id replace store_id", () => {
      const sameRaw = "same-uuid";
      expect(memberIdentityKey(sameRaw)).not.toEqual(storeIdentityKey(sameRaw));
    });

    it("keeps multi-store B/C independent", () => {
      const map = projectOwnerSurfacesByStore([
        { storeId: "s1", ownerChatUnreadRoomCount: 2, ownerOperationAttentionCount: 5 },
        { storeId: "s2", ownerChatUnreadRoomCount: 0, ownerOperationAttentionCount: 1 },
      ]);
      expect(map.get(storeIdentityKey("s1"))).toMatchObject({
        ownerChatUnreadRoomCount: 2,
        ownerOperationAttentionCount: 5,
        ownerPresentationTotal: 7,
      });
      expect(map.get(storeIdentityKey("s2"))).toMatchObject({
        ownerChatUnreadRoomCount: 0,
        ownerOperationAttentionCount: 1,
        ownerPresentationTotal: 1,
      });
      const s1 = map.get(storeIdentityKey("s1"))!;
      const s2 = map.get(storeIdentityKey("s2"))!;
      expect(s1.ownerOperationAttentionCount + s2.ownerOperationAttentionCount).toBe(6);
      // Authority remains per-store — no single summed authority key.
      expect(map.size).toBe(2);
    });
  });

  describe("room vs message units", () => {
    it("one room with 20 messages → App Icon B = 1", () => {
      const roomIds = Array.from({ length: 20 }, () => "room-a");
      expect(uniqueUnreadRoomCount(roomIds)).toBe(1);
      expect(
        bCommunicationItemCount({
          unreadRoomCount: uniqueUnreadRoomCount(roomIds),
          unresolvedMissedCallCount: 0,
        })
      ).toBe(1);
      expect(asUnreadMessageCount(20)).toBe(20);
      expect(asUnreadRoomCount(1)).toBe(1);
    });

    it("two rooms → App Icon B = 2 regardless of message totals", () => {
      expect(uniqueUnreadRoomCount(["r1", "r1", "r2"])).toBe(2);
      expect(
        bCommunicationItemCount({
          unreadRoomCount: 2,
          unresolvedMissedCallCount: 0,
        })
      ).toBe(2);
    });

    it("room read drops hub/App Icon by 1 not by message count", () => {
      const delta = applyCommunicationRoomRead({
        unreadMessageCountBefore: 20,
        roomWasUnread: true,
      });
      expect(delta.roomRowMessageCountAfter).toBe(0);
      expect(delta.unreadRoomCountDelta).toBe(-1);
      expect(delta.appIconBDelta).toBe(-1);
    });
  });

  describe("surface projections", () => {
    it("Bell = A only", () => {
      expect(projectBellBadge(4)).toBe(4);
      expect(classifyBadgeContractEvent("general_message").bell).toBe(0);
      expect(classifyBadgeContractEvent("store_new_order").bell).toBe(0);
    });

    it("App Icon = A + B only; C forbidden", () => {
      const ok = projectMemberAppIconTotal({
        aMemberUnreadNotificationCount: 3,
        memberUnreadRoomCount: 2,
        unresolvedMissedCallCount: 1,
      });
      expect(ok).toEqual({ ok: true, appIconTotal: 6 });

      expect(
        projectMemberAppIconTotal({
          aMemberUnreadNotificationCount: 1,
          memberUnreadRoomCount: 0,
          unresolvedMissedCallCount: 0,
          ownerOperationCount: 1,
        })
      ).toEqual({ ok: false, reason: "C_forbidden_in_member_app_icon" });

      expect(
        projectMemberAppIconTotal({
          aMemberUnreadNotificationCount: 0,
          memberUnreadRoomCount: 1,
          unresolvedMissedCallCount: 0,
          ownerStoreChatRoomCount: 4,
        })
      ).toEqual({
        ok: false,
        reason: "store_owner_chat_B_forbidden_in_member_app_icon",
      });
    });

    it("Bottom Chat = General + Group rooms only", () => {
      expect(
        projectBottomChatBadge({
          generalDirectUnreadRoomCount: 2,
          groupUnreadRoomCount: 1,
        })
      ).toBe(3);
      const memberRooms = memberBUnreadRoomCount({
        generalDirectRoomIds: ["g1", "g2"],
        groupRoomIds: ["grp1"],
        tradeRoomIds: ["t1"],
        customerStoreOrderRoomIds: ["o1", "o2"],
      });
      expect(memberRooms).toBe(6);
      expect(
        projectBottomChatBadge({
          generalDirectUnreadRoomCount: uniqueUnreadRoomCount(["g1", "g2"]),
          groupUnreadRoomCount: uniqueUnreadRoomCount(["grp1"]),
        })
      ).toBe(3);
      expect(projectTradeHubBadge(uniqueUnreadRoomCount(["t1"]))).toBe(1);
      expect(projectCustomerOrderHubBadge(uniqueUnreadRoomCount(["o1", "o2"]))).toBe(2);
    });

    it("Owner surfaces keep B and C separate; presentation is not authority", () => {
      const owner = projectOwnerStoreSurfaces({
        storeId: "store-1",
        ownerChatUnreadRoomCount: 3,
        ownerOperationAttentionCount: 7,
      });
      expect(owner.ownerChatUnreadRoomCount).toBe(3);
      expect(owner.ownerOperationAttentionCount).toBe(7);
      expect(owner.ownerPresentationTotal).toBe(10);
      expect(owner.storeIdentityKey).toBe("store:store-1");
      // Store B is not member App Icon.
      expect(
        projectMemberAppIconTotal({
          aMemberUnreadNotificationCount: 0,
          memberUnreadRoomCount: 0,
          unresolvedMissedCallCount: 0,
          ownerStoreChatRoomCount: owner.ownerChatUnreadRoomCount,
        }).ok
      ).toBe(false);
    });

    it("store B unread is store-scoped, not user-owned", () => {
      expect(
        storeBUnreadRoomCount({
          storeId: "s1",
          ownerStoreOrderRoomIds: ["r1", "r1", "r2"],
        })
      ).toBe(2);
    });
  });

  describe("increase / decrease contracts", () => {
    it("missed call counts once per call_id", () => {
      expect(
        unresolvedMissedCallCountFromCallIds(["c1", "c1", "c2"])
      ).toBe(2);
      const first = applyMissedCallSeen({
        callId: "c1",
        alreadySeenCallIds: new Set(),
      });
      expect(first).toEqual({ unresolvedDelta: -1, appIconBDelta: -1 });
      const dup = applyMissedCallSeen({
        callId: "c1",
        alreadySeenCallIds: new Set(["c1"]),
      });
      expect(dup).toEqual({ unresolvedDelta: 0, appIconBDelta: 0 });
    });

    it("Bell mark-all-read clears A only; B and C unchanged", () => {
      const r = applyMemberAMarkAllRead({ aBefore: 5, bBefore: 4, cBefore: 2 });
      expect(r.aAfter).toBe(0);
      expect(r.bellAfter).toBe(0);
      expect(r.bAfter).toBe(4);
      expect(r.cAfter).toBe(2);
      expect(r.bUnchanged).toBe(true);
      expect(r.cUnchanged).toBe(true);
    });

    it("owner order accept changes C only", () => {
      expect(applyOwnerOrderAccept({ aBefore: 3, bBefore: 2, cBefore: 1 })).toEqual({
        aAfter: 3,
        bAfter: 2,
        cAfter: 0,
      });
    });
  });

  describe("FCM transport contract", () => {
    it("FCM is never authority; marketing has badge_effect none", () => {
      const m = fcmContractForPushKind("marketing_ephemeral");
      expect(m).toEqual({
        persistsInInbox: false,
        badgeEffect: "none",
        isAuthority: false,
      });
      const n = fcmContractForPushKind("notice_persistent");
      expect(n.badgeEffect).toBe("A");
      expect(n.persistsInInbox).toBe(true);
      expect(n.isAuthority).toBe(false);
      const s = fcmContractForPushKind("store_operation");
      expect(s.badgeEffect).toBe("C_store");
      expect(s.isAuthority).toBe(false);
    });

    it("owner new order deep link is store admin path", () => {
      expect(ownerNewOrderDeepLinkTarget("storeA", "ord9")).toBe(
        "/stores/owner/storeA/orders/ord9"
      );
    });
  });
});
