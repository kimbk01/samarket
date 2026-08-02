import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildMemberAppIconWebProjection,
  deriveMemberUnresolvedMissedCallCount,
  projectMemberBottomChatBadge,
  projectMemberCustomerOrderHubBadge,
  projectMemberTradeHubBadge,
  resolveMissedCallIdForBMember,
} from "@/lib/notifications/badge-authority-rebuild/member-communication-b-projection";
import {
  buildNotificationBadgeProjection,
  EMPTY_NON_CHAT_EVENT_ATTENTION,
} from "@/lib/notifications/build-notification-badge-projection";
import { aggregateOrphanMissedCallFacts } from "@/lib/notifications/load-orphan-missed-call-facts";
import { projectionInputFromBadgeCountAuthorityJson } from "@/lib/notifications/apply-badge-count-authority-response";
import { auditUnreadProjectionForIdentity } from "@/lib/notifications/badge-authority-rebuild/unread-cursor-truth-plan";
import { memberBUnreadRoomCount } from "@/lib/notifications/badge-authority-rebuild/phase1-authority-contract";

describe("Slice 2-3 member communication B projection", () => {
  it("row messages vs hub rooms — 20 msgs = row 20 / room 1", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: {
        general_direct: 1,
        group: 0,
        trade: 0,
        store_order: 0,
      },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      memberUnreadNotificationCount: 0,
      rowUnreadByRoomId: { r1: 20 },
    });
    expect(p.rowUnreadByRoomId.r1).toBe(20);
    expect(p.memberUnreadRoomCount).toBe(1);
    expect(p.appIconTotal).toBe(1);
  });

  it("two rooms 20+3 → rows 20,3 / room count 2", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: {
        general_direct: 1,
        group: 1,
        trade: 0,
        store_order: 0,
      },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      memberUnreadNotificationCount: 0,
      rowUnreadByRoomId: { a: 20, b: 3 },
    });
    expect(p.rowUnreadByRoomId).toEqual({ a: 20, b: 3 });
    expect(p.memberUnreadRoomCount).toBe(2);
    expect(p.bottomChat).toBe(2);
  });

  it("alias+canonical membership audits as duplicate failure", () => {
    const audit = auditUnreadProjectionForIdentity({
      canonicalRoomId: "room-1",
      membershipKeys: ["room-1", "alias:room-1"],
    });
    expect(audit.ok).toBe(false);
    expect(audit.reason).toBe("duplicate_room_membership");
  });

  it("bucket dedupe keeps same room once across bags", () => {
    expect(
      memberBUnreadRoomCount({
        generalDirectRoomIds: ["r1", "r1"],
        groupRoomIds: ["r1"],
        tradeRoomIds: [],
        customerStoreOrderRoomIds: [],
      })
    ).toBe(1);
  });

  it("General/Group Bottom read path units", () => {
    const before = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      memberUnreadNotificationCount: 0,
    });
    expect(before.bottomChat).toBe(2);
    const afterGeneral = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 1, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      memberUnreadNotificationCount: 0,
    });
    expect(afterGeneral.bottomChat).toBe(1);
    const afterBoth = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      memberUnreadNotificationCount: 0,
    });
    expect(afterBoth.bottomChat).toBe(0);
    // re-read same zero state — no negative
    expect(
      buildNotificationBadgeProjection({
        domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 0 },
        orphanMissedCall: 0,
        nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
        memberUnreadNotificationCount: 0,
      }).bottomChat
    ).toBe(0);
  });

  it("Trade hub rooms; status A does not affect Trade Hub", () => {
    const trade = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      memberUnreadNotificationCount: 0,
      rowUnreadByRoomId: { t1: 5 },
    });
    expect(trade.rowUnreadByRoomId.t1).toBe(5);
    expect(trade.tradeHub).toBe(1);
    expect(projectMemberTradeHubBadge(2)).toBe(2);

    const withStatusA = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 1, store_order: 0 },
      orphanMissedCall: 0,
      nonChatEventAttention: {
        tradeStatus: 4,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 0,
      },
      memberUnreadNotificationCount: 4,
      notificationAttentionTotal: 9,
    });
    expect(withStatusA.tradeHub).toBe(1);
    expect(withStatusA.bellTotal).toBe(4);
  });

  it("Customer hub buyer-only; owner excluded from hub + Member App Icon", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 9 },
      storeOrderBuyerDeliveryUnread: 1,
      storeOrderOwnerChatUnread: 8,
      orphanMissedCall: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      memberUnreadNotificationCount: 0,
      rowUnreadByRoomId: { c1: 7 },
    });
    expect(p.rowUnreadByRoomId.c1).toBe(7);
    expect(p.storeOrderCustomerUnreadRooms).toBe(1);
    expect(projectMemberCustomerOrderHubBadge(p.storeOrderCustomerUnreadRooms)).toBe(1);
    expect(p.storeOrderOwnerUnreadRooms).toBe(8);
    expect(p.appIcon.storeOrder).toBe(1);
    expect(p.memberUnreadRoomCount).toBe(1);
    expect(p.appIconTotal).toBe(1);
    expect(p.bottomChat).toBe(0);

    const withOrderStatusA = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 1 },
      storeOrderBuyerDeliveryUnread: 1,
      storeOrderOwnerChatUnread: 0,
      orphanMissedCall: 0,
      nonChatEventAttention: {
        tradeStatus: 0,
        orderStatus: 3,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 0,
      },
      memberUnreadNotificationCount: 3,
    });
    expect(withOrderStatusA.storeOrderCustomerUnreadRooms).toBe(1);
    expect(withOrderStatusA.bellTotal).toBe(3);
  });

  it("missed call_id dedupe; empty when no unresolved ids", () => {
    expect(
      deriveMemberUnresolvedMissedCallCount({ callIds: ["c1", "c1", "c2"] })
    ).toBe(2);
    expect(deriveMemberUnresolvedMissedCallCount({ callIds: [] })).toBe(0);
    expect(
      deriveMemberUnresolvedMissedCallCount({ orphanMissedCallCount: 0 })
    ).toBe(0);

    const agg = aggregateOrphanMissedCallFacts([
      { id: "a", room_id: null, dedupe_key: "missed:sess-1:u1", display_payload: {} },
      { id: "b", room_id: null, dedupe_key: "missed:sess-1:u1", display_payload: {} },
      { id: "c", room_id: null, dedupe_key: "missed:sess-2:u1", display_payload: {} },
    ]);
    expect(agg.orphan).toBe(3);
    expect(agg.orphanCallIds).toEqual(["sess-1", "sess-2"]);

    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 3,
      unresolvedMissedCallIds: ["sess-1", "sess-1", "sess-2"],
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      memberUnreadNotificationCount: 0,
    });
    expect(p.memberUnresolvedMissedCallCount).toBe(2);
    expect(p.appIconTotal).toBe(2);
  });

  it("call stub room + orphan missed uses room count + call_id once (no double room)", () => {
    // Room already in unread set; orphan missed adds B_missed by call_id only.
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 0, trade: 0, store_order: 0 },
      orphanMissedCall: 1,
      unresolvedMissedCallIds: ["sess-x"],
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      memberUnreadNotificationCount: 0,
      rowUnreadByRoomId: { "room-with-stub": 1 },
    });
    expect(p.memberUnreadRoomCount).toBe(1);
    expect(p.memberUnresolvedMissedCallCount).toBe(1);
    expect(p.appIconTotal).toBe(2);
  });

  it("A=2 rooms=3 missed=1 → Member Web total 6; B_store/C/owner_intake do not inflate B", () => {
    const ok = buildMemberAppIconWebProjection({
      aMemberUnreadNotificationCount: 2,
      generalDirectUnreadRooms: 1,
      groupUnreadRooms: 1,
      tradeUnreadRooms: 1,
      customerStoreOrderUnreadRooms: 0,
      orphanMissedCallCount: 1,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.projection.memberAppIconWebTotal).toBe(6);

    expect(
      buildMemberAppIconWebProjection({
        aMemberUnreadNotificationCount: 2,
        generalDirectUnreadRooms: 1,
        groupUnreadRooms: 1,
        tradeUnreadRooms: 1,
        customerStoreOrderUnreadRooms: 0,
        orphanMissedCallCount: 1,
        ownerStoreOrderUnreadRooms: 9,
      }).ok
    ).toBe(false);
    expect(
      buildMemberAppIconWebProjection({
        aMemberUnreadNotificationCount: 2,
        generalDirectUnreadRooms: 1,
        groupUnreadRooms: 1,
        tradeUnreadRooms: 1,
        customerStoreOrderUnreadRooms: 0,
        orphanMissedCallCount: 1,
        storeActionRequiredCount: 4,
      }).ok
    ).toBe(false);

    const builder = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 1, group: 1, trade: 1, store_order: 9 },
      storeOrderBuyerDeliveryUnread: 0,
      storeOrderOwnerChatUnread: 9,
      orphanMissedCall: 1,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 40,
      memberUnreadNotificationCount: 2,
    });
    expect(builder.memberAppIconWebTotal).toBe(2 + 3 + 1);
    expect(builder.bellTotal).toBe(2);
    expect(builder.storeOrderOwnerUnreadRooms).toBe(9);
  });

  it("Bell A regression: chat/missed/owner rooms do not raise Bell when A fixed", () => {
    const baseA = 2;
    const chat = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 5, group: 5, trade: 5, store_order: 5 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 3,
      orphanMissedCall: 4,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
      notificationAttentionTotal: 99,
      memberUnreadNotificationCount: baseA,
    });
    expect(chat.bellTotal).toBe(baseA);
    expect(chat.appIconTotal).toBe(baseA + 5 + 5 + 5 + 2 + 4);
  });

  it("HTTP + Apply facts do not double-count same call_id", () => {
    const input = projectionInputFromBadgeCountAuthorityJson({
      domainUnreadRooms: {
        general_direct: 0,
        group: 0,
        trade: 0,
        store_order: 0,
      },
      storeOrderBuyerDeliveryUnread: 0,
      storeOrderOwnerChatUnread: 0,
      orphanMissedCallCount: 3,
      unresolvedMissedCallIds: ["sess-1", "sess-1", "sess-2"],
      notificationAttentionTotal: 1,
      memberUnreadNotificationCount: 0,
      nonChatEventAttention: EMPTY_NON_CHAT_EVENT_ATTENTION,
    });
    expect(input).not.toBeNull();
    const p = buildNotificationBadgeProjection(input!);
    expect(p.memberUnresolvedMissedCallCount).toBe(2);
    expect(p.appIconTotal).toBe(2);
  });

  it("Bottom helper = GD + Group only", () => {
    expect(
      projectMemberBottomChatBadge({
        generalDirectUnreadRooms: 2,
        groupUnreadRooms: 3,
      })
    ).toBe(5);
  });

  it("resolveMissedCallIdForBMember prefers session then dedupe", () => {
    expect(
      resolveMissedCallIdForBMember({
        call_session_id: "sess-1",
        dedupe_key: "missed:other:u",
      })
    ).toBe("sess-1");
    expect(
      resolveMissedCallIdForBMember({
        dedupe_key: "missed:sess-9:user-a",
      })
    ).toBe("sess-9");
  });

  it("Bell consumers must not import B_member projection", () => {
    const root = process.cwd();
    const consumers = [
      "components/philife/PhilifeHeaderNotificationInbox.tsx",
      "components/my/MyNotificationsView.tsx",
      "lib/notifications/inbox-read-bridge.ts",
      "lib/notifications/resolve-tier1-bell-surface.ts",
    ];
    for (const rel of consumers) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      expect(src.includes("member-communication-b-projection"), rel).toBe(false);
      expect(src.includes("buildMemberCommunicationBProjection"), rel).toBe(false);
    }
  });

  it("Native/FCM product files unchanged by Slice 2-3 markers", () => {
    const root = process.cwd();
    const natives = [
      "lib/push/native/sync-native-badge-count.ts",
      "lib/notifications/pipeline/notify-push-dispatcher.ts",
    ];
    for (const rel of natives) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      expect(src.includes("member-communication-b-projection"), rel).toBe(false);
      expect(src.includes("memberAppIconWebTotal"), rel).toBe(false);
    }
  });
});
