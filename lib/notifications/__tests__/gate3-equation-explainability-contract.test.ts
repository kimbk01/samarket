/**
 * GATE 3 equation / explainability regression guards.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEMBER_NOTIFICATION_A_KINDS } from "@/lib/notifications/badge-authority-rebuild/badge-event-classifier";
import {
  isMemberNotificationAUnread,
  isMemberNotificationAListItem,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import {
  filterMemberNotificationAInboxRows,
  filterMemberNotificationAUnreadAuthorityRows,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import {
  applyReadAckToConversationRooms,
  projectSurfacesFromConversationAuthority,
  resolveMemberConversationAuthority,
  type MemberConversationRoomInput,
} from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import { resolveMemberAppIconAuthority } from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import { markMemberANotificationsAllRead } from "@/lib/notifications/inbox-read-bridge";
import { shouldApplyMemberNotificationReadOnPushTap } from "@/lib/notifications/badge-authority-rebuild/push-routing-transport";
import { resolveOwnerActiveStoreId } from "@/lib/delivery/owner/resolve-owner-active-store";
import { loadAdminActionQueueCounts } from "@/lib/admin/admin-action-queue";
import { projectFeedAdOpsProductStatus } from "@/lib/ads/feed-ad-ops-presentation";
import { generalDirectRoomIdentity } from "@/lib/chat-domain/room-identity";
import { isMemberBadgeAuthoritySurface } from "@/lib/notifications/member-badge-surface-authority";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const MEMBER = "member-gate3";

function aRow(partial: Record<string, unknown>) {
  return {
    unread: true,
    read_at: null,
    display_payload: {},
    ...partial,
  };
}

function bRoom(
  partial: Partial<MemberConversationRoomInput> &
    Pick<MemberConversationRoomInput, "roomId" | "chatDomain" | "unreadMessageCount">
): MemberConversationRoomInput {
  return {
    memberId: MEMBER,
    leftAt: null,
    deletedAt: null,
    latestMessageId: partial.unreadMessageCount > 0 ? "tip" : null,
    ...partial,
  };
}

describe("bell-badge-equation", () => {
  it("A digit = unread eligible notification_events after dedupe", () => {
    const rows = [
      aRow({ id: "a1", type: "trade_status", category: "trade_status", dedupe_key: "t1" }),
      aRow({ id: "a2", type: "community_activity", category: "community_activity", dedupe_key: "c1" }),
      aRow({ id: "chat", type: "chat_message", category: "chat_message", room_id: "r1" }),
      aRow({
        id: "own",
        type: "order_status",
        category: "order_status",
        display_payload: { legacyMeta: { kind: "store_order_created", store_id: "s1" } },
      }),
    ];
    const auth = resolveMemberNotificationAuthorityFromRows(rows, MEMBER);
    expect(auth.unreadCount).toBe(2);
    expect(auth.eventIds).toEqual(["a1", "a2"]);
  });
});

describe("bell-list-count-identity", () => {
  it("unread list ids === A eventIds", () => {
    const inbox = [
      { id: "a1", notification_type: "trade_status", is_read: false, dedupe_key: "t1" },
      { id: "a2", notification_type: "community_activity", is_read: false, dedupe_key: "c1" },
      { id: "r1", notification_type: "admin_notice", is_read: true, dedupe_key: "n1" },
      { id: "c1", notification_type: "chat", is_read: false, room_id: "room-1" },
    ];
    const unread = filterMemberNotificationAUnreadAuthorityRows(inbox, MEMBER);
    const auth = resolveMemberNotificationAuthorityFromRows(
      inbox.map((r) => ({
        id: r.id,
        type: r.notification_type,
        unread: r.is_read !== true,
        read_at: r.is_read ? "2026-08-01T00:00:00.000Z" : null,
        dedupe_key: r.dedupe_key,
        room_id: "room_id" in r ? r.room_id : null,
        display_payload: {},
      })),
      MEMBER
    );
    expect(unread.map((r) => r.id).sort()).toEqual([...auth.eventIds].sort());
    expect(unread).toHaveLength(auth.unreadCount);
  });
});

describe("bell-a-full-table-not-page-slice", () => {
  it("NC unread_total loader is independent of inbox page rows", () => {
    const route = read("app/api/me/notifications/route.ts");
    const http = read("lib/notifications/pipeline/build-domain-badge-authority-http.ts");
    const apply = read("lib/notifications/apply-badge-count-authority-response.ts");
    expect(route).toContain("loadMemberNotificationAUnreadCount");
    expect(route).not.toMatch(/unreadTotal[\s\S]{0,120}eventRows\.map/);
    expect(http).toContain("MEMBER_NOTIFICATION_A_LOAD_LIMIT");
    expect(http).toContain("notificationA.unreadCount");
    expect(apply).toContain("memberUnreadNotificationCount");
    expect(apply).toContain("resolveMemberBellDigit");
    // Canonical A field is preferred before projection.bellTotal bridge.
    const applyIdx = apply.indexOf("function resolveMemberBellDigit");
    const memberIdx = apply.indexOf("memberUnreadNotificationCount", applyIdx);
    const bellTotalIdx = apply.indexOf("bellTotal", memberIdx);
    expect(applyIdx).toBeGreaterThan(-1);
    expect(memberIdx).toBeGreaterThan(applyIdx);
    expect(bellTotalIdx).toBeGreaterThan(memberIdx);
  });
});

describe("bell-mark-all-target-identity", () => {
  it("mark-all writer uses canonical A event ids only", () => {
    const src = read("lib/notifications/inbox-read-bridge.ts");
    expect(src).toContain("markCanonicalMemberANotificationEventsRead");
    expect(src).toContain("resolveMemberNotificationAuthorityFromRows");
    expect(src).toContain("idsToMark");
    expect(typeof markMemberANotificationsAllRead).toBe("function");
  });
});

describe("community-activity-in-a", () => {
  it("community_activity is A kind and unread-eligible", () => {
    expect(MEMBER_NOTIFICATION_A_KINDS).toContain("community_activity");
    expect(
      isMemberNotificationAUnread({
        id: "ca1",
        type: "community_activity",
        category: "community_activity",
        unread: true,
        read_at: null,
        dedupe_key: "ca",
        display_payload: {},
      })
    ).toBe(true);
  });
});

describe("a-kinds-equals-unread-filter", () => {
  it("A kinds are the unread list eligibility set (chat/owner excluded)", () => {
    for (const kind of MEMBER_NOTIFICATION_A_KINDS) {
      expect(
        isMemberNotificationAListItem({
          id: `e-${kind}`,
          type: kind,
          category: kind,
          unread: true,
          read_at: null,
          display_payload: {},
        })
      ).toBe(true);
    }
    expect(
      isMemberNotificationAUnread({
        id: "chat",
        type: "chat_message",
        unread: true,
        read_at: null,
        display_payload: {},
      })
    ).toBe(false);
  });
});

describe("chat-badge-equation", () => {
  it("B = unread room count GD+group+trade+customer, not message sum", () => {
    const rooms = [
      bRoom({
        roomId: "gd1",
        chatDomain: "general_direct",
        unreadMessageCount: 9,
        peerUserId: "p1",
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "p1").identityKey,
      }),
      bRoom({
        roomId: "g1",
        chatDomain: "group",
        unreadMessageCount: 4,
        groupId: "g1",
        domainIdentityKey: "group:g1",
      }),
      bRoom({
        roomId: "t1",
        chatDomain: "trade",
        unreadMessageCount: 2,
        listingId: "L1",
        sellerId: "s",
        counterpartyId: "c",
        domainIdentityKey: "trade:L1:s:c",
      }),
      bRoom({
        roomId: "o1",
        chatDomain: "store_order_customer",
        unreadMessageCount: 7,
        orderId: "ord1",
        domainIdentityKey: "store_order:ord1",
      }),
      bRoom({
        roomId: "owner1",
        chatDomain: "store_order_owner",
        unreadMessageCount: 3,
        domainIdentityKey: "store_order_owner:x",
      }),
      bRoom({
        roomId: "phantom",
        chatDomain: "general_direct",
        unreadMessageCount: 5,
        latestMessageId: null,
        peerUserId: "px",
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "px").identityKey,
      }),
    ];
    const auth = resolveMemberConversationAuthority(MEMBER, rooms);
    const surfaces = projectSurfacesFromConversationAuthority(auth);
    expect(auth.totalUnreadRooms).toBe(4);
    expect(surfaces.bottomChat).toBe(4);
    expect(surfaces.conversationB).toBe(4);
    expect(auth.generalUnreadRooms + auth.groupUnreadRooms + auth.tradeUnreadRooms + auth.orderUnreadRooms).toBe(4);
  });
});

describe("chat-list-count-identity", () => {
  it("unread flat list route and home-state expand trade/SO rooms", () => {
    const ia = read("lib/community-messenger/messenger-ia.ts");
    const home = read("lib/community-messenger/use-community-messenger-home-state.ts");
    const nav = read("lib/main-menu/bottom-nav-config.ts");
    expect(ia).toContain('qs.set("inbox", inbox)');
    expect(nav).toContain("inbox=unread");
    expect(home).toContain('chatInboxFilter === "unread"');
    expect(home).toContain("communityMessengerRoomIsConfirmedTrade");
    expect(home).toContain("communityMessengerRoomIsConfirmedDelivery");
  });
});

describe("app-icon-equation", () => {
  it("App Icon = A + B only", () => {
    const a = resolveMemberNotificationAuthorityFromRows(
      [aRow({ id: "n1", type: "admin_notice", category: "admin_notice", dedupe_key: "n1" })],
      MEMBER
    );
    const b = resolveMemberConversationAuthority(MEMBER, [
      bRoom({
        roomId: "gd1",
        chatDomain: "general_direct",
        unreadMessageCount: 2,
        peerUserId: "p1",
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "p1").identityKey,
      }),
      bRoom({
        roomId: "t1",
        chatDomain: "trade",
        unreadMessageCount: 1,
        listingId: "L1",
        sellerId: "s",
        counterpartyId: "c",
        domainIdentityKey: "trade:L1:s:c",
      }),
    ]);
    const icon = resolveMemberAppIconAuthority({
      notificationA: a,
      conversationB: b,
      revision: 1,
    });
    expect(icon.appIconTotal).toBe(a.unreadCount + b.totalUnreadRooms);
    expect(icon.appIconTotal).toBe(3);
  });
});

describe("app-icon-zero-invariant", () => {
  it("A=0 and B=0 → App Icon 0", () => {
    const a = resolveMemberNotificationAuthorityFromRows([], MEMBER);
    const b = resolveMemberConversationAuthority(MEMBER, []);
    const icon = resolveMemberAppIconAuthority({
      notificationA: a,
      conversationB: b,
      revision: 1,
    });
    expect(a.unreadCount).toBe(0);
    expect(b.totalUnreadRooms).toBe(0);
    expect(icon.appIconTotal).toBe(0);
  });
});

describe("owner-member-isolation", () => {
  it("owner commerce / intake is not Member A and not App Icon", () => {
    expect(
      isMemberNotificationAUnread({
        id: "o1",
        type: "order_status",
        unread: true,
        read_at: null,
        display_payload: { legacyMeta: { kind: "store_order_created", store_id: "s1" } },
      })
    ).toBe(false);
    const http = read("lib/notifications/pipeline/build-domain-badge-authority-http.ts");
    expect(http).toContain("ownerOperationCount: 0");
  });
});

describe("admin-member-isolation", () => {
  it("admin surface does not run member badge-count", () => {
    expect(isMemberBadgeAuthoritySurface("/admin")).toBe(false);
    expect(isMemberBadgeAuthoritySurface("/admin/customer-platform")).toBe(false);
    expect(isMemberBadgeAuthoritySurface("/notifications")).toBe(true);
  });
});

describe("mark-all-scope", () => {
  it("NC mark-all hits A-only API flag", () => {
    const view = read("components/my/MyNotificationsView.tsx");
    const route = read("app/api/me/notifications/route.ts");
    expect(view).toContain("mark_my_notifications_read_excluding_owner_and_chat");
    expect(route).toContain("markMemberANotificationsAllRead");
  });
});

describe("push-tap-read-contract", () => {
  it("non-chat push may mark A; chat room path does not", () => {
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        path: "/notifications",
        type: "admin_notice",
      })
    ).toBe(true);
    expect(
      shouldApplyMemberNotificationReadOnPushTap({
        path: "/community-messenger/rooms/r1",
        type: "chat_message",
      })
    ).toBe(false);
    const listener = read("components/push/PushRouteListener.tsx");
    expect(listener).toContain("shouldApplyMemberNotificationReadOnPushTap");
    expect(listener).toContain("postNotificationEventOpenedRead");
  });
});

describe("logout-zero", () => {
  it("logout durable clear remains the native zero writer", () => {
    const flow = read("lib/auth/explicit-logout-flow.ts");
    const native = read("components/push/NativeBadgeSync.tsx");
    expect(flow).toContain("beginLogoutBadgeClearTransaction");
    expect(native).toContain("clear_logout");
    expect(native).toContain("recoverPendingLogoutBadgeClearTransaction");
  });
});

describe("account-switch-isolation", () => {
  it("NativeBadgeSync clears previous identity before new snapshot", () => {
    const native = read("components/push/NativeBadgeSync.tsx");
    expect(native).toContain("account_switch");
    expect(native).toContain("getSyncViewerUserIdForClient");
    expect(native).toContain("lastMemberIdRef");
  });
});

describe("native-no-second-writer", () => {
  it("Android summary / iOS APNS are projections, not independent writers", () => {
    const android = read("android/app/src/main/java/com/dibay/app/DibayAppIconDeliveryAdapter.java");
    const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    const ios = read("ios/App/App/Plugins/DibayAppIconDeliveryAdapter.swift");
    const push = read("components/push/PushRouteListener.tsx");
    const mark = read("lib/community-messenger/room/community-messenger-mark-read-fetch.ts");
    expect(android).toContain("setAutoCancel(false)");
    expect(android).not.toContain("setAutoCancel(true)");
    expect(android).toContain("fcm_hint_ignored");
    expect(fcm).toContain("setNumber(0)");
    expect(ios).toContain("apns_fcm_badge_hint_ignored");
    expect(ios).not.toMatch(/apply\(appIconTotal:\s*badge\)/);
    expect(push).toContain("removeDeliveredNotificationOnPushTap");
    expect(mark).toContain("afterCommunityMessengerMarkReadAck");
    expect(mark).toContain("removeDeliveredNotificationsForRoomRead");
  });
});

describe("owner-active-store-picker-identity", () => {
  it("Hub / layout / shell share resolveOwnerActiveStore*", () => {
    expect(
      resolveOwnerActiveStoreId({
        stores: [{ id: "a" }, { id: "b" }],
        routeStoreId: "b",
        preferredStoreId: "a",
      })
    ).toBe("b");
    const hub = read("components/business/owner/OwnerHubRuntimeProvider.tsx");
    const layout = read("app/(main)/stores/owner/layout.tsx");
    const shell = read("components/business/admin/BusinessAdminShell.tsx");
    expect(hub).toContain("resolveOwnerActiveStoreRow");
    expect(layout).toContain("resolveOwnerActiveStoreRow");
    expect(layout).toContain("OWNER_ACTIVE_STORE_COOKIE");
    expect(layout).not.toContain("preferredStoreId: pack.stores[0]");
    expect(shell).toContain("writeOwnerActiveStoreIdToSession");
  });
});

describe("admin-bell-equals-action-queue", () => {
  it("Admin Bell tap goes to Action Queue; count uses loadAdminActionQueueCounts", () => {
    const bell = read("components/admin/order-notifications/AdminNotificationBell.tsx");
    const api = read("app/api/admin/admin-bell/route.ts");
    expect(bell).toContain("/admin/customer-platform#action-queue");
    expect(bell).not.toContain("/admin/ad-applications");
    expect(api).toContain("loadAdminActionQueueCounts");
    expect(typeof loadAdminActionQueueCounts).toBe("function");
  });
});

describe("feed-ad-admin-count-uses-projector", () => {
  it("admin action queue counts feed ads via projectFeedAdOpsProductStatus", () => {
    const src = read("lib/admin/admin-action-queue.ts");
    expect(src).toContain("projectFeedAdOpsProductStatus");
    expect(projectFeedAdOpsProductStatus({ requestStatus: "pending_review" })).toBe("pending_review");
    expect(
      projectFeedAdOpsProductStatus({
        requestStatus: "approved",
        campaignStatus: "ended",
      })
    ).not.toBe("pending_review");
  });
});

describe("chat-read-contract-no-list-open", () => {
  it("list open does not zero B; read ACK does", () => {
    const rooms: MemberConversationRoomInput[] = [
      bRoom({
        roomId: "gd1",
        chatDomain: "general_direct",
        unreadMessageCount: 2,
        peerUserId: "p1",
        domainIdentityKey: generalDirectRoomIdentity(MEMBER, "p1").identityKey,
      }),
    ];
    const before = resolveMemberConversationAuthority(MEMBER, rooms);
    expect(before.totalUnreadRooms).toBe(1);
    const afterFail = applyReadAckToConversationRooms(rooms, {
      roomId: "gd1",
      lastReadMessageId: "m9",
      serverAckOk: false,
    });
    expect(resolveMemberConversationAuthority(MEMBER, afterFail).totalUnreadRooms).toBe(1);
    const afterOk = applyReadAckToConversationRooms(rooms, {
      roomId: "gd1",
      lastReadMessageId: "m9",
      serverAckOk: true,
    });
    expect(resolveMemberConversationAuthority(MEMBER, afterOk).totalUnreadRooms).toBe(0);
  });
});
