import { describe, expect, it } from "vitest";
import {
  buildMemberNotificationAProjection,
  deriveMemberUnreadNotificationCount,
  filterMemberNotificationAInboxRows,
  isMemberNotificationAListItem,
  isMemberNotificationAUnread,
  memberNotificationAEventFromInboxRow,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import { buildNotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";

function row(partial: Record<string, unknown>) {
  return {
    id: "e1",
    unread: true,
    read_at: null,
    display_payload: {},
    ...partial,
  };
}

describe("Slice 2-2 member notification A projection", () => {
  it("includes trade/order status and admin notice; excludes owner_intake/chat/missed/marketing", () => {
    const rows = [
      row({ id: "a1", type: "trade_status", category: "trade_status", dedupe_key: "t1" }),
      row({
        id: "a2",
        type: "order_status",
        category: "order_status",
        display_payload: { legacyMeta: { kind: "store_order_owner_status", order_id: "o1" } },
      }),
      row({ id: "a3", type: "admin_notice", category: "admin_notice", dedupe_key: "n1" }),
      row({
        id: "c1",
        type: "order_status",
        category: "order_status",
        dedupe_key: "commerce:owner:new_order:ox",
        display_payload: {
          legacyMeta: { kind: "store_order_created", order_id: "ox", store_id: "s1" },
        },
      }),
      row({ id: "b1", type: "chat_message", category: "chat", room_id: "r1" }),
      // room-bound missed → B only (not A)
      row({
        id: "m1",
        type: "missed_call",
        category: "missed_call",
        room_id: "room-miss",
        dedupe_key: "missed:1",
      }),
      row({ id: "mk", type: "admin_marketing_banner", category: "admin_marketing_banner" }),
    ];
    const proj = buildMemberNotificationAProjection(rows);
    expect(proj.memberUnreadNotificationCount).toBe(3);
    expect(proj.eventIds).toHaveLength(3);
    expect(proj.memberUnreadNotificationCount).toBe(proj.eventIds.length);
    expect(isMemberNotificationAUnread(rows[3]!)).toBe(false);
    expect(isMemberNotificationAUnread(rows[4]!)).toBe(false);
    expect(deriveMemberUnreadNotificationCount(rows)).toBe(3);
  });

  it("Bell uses A; App Icon uses A + B_member (not Phase B NotificationAttention)", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: {
        general_direct: 1,
        group: 0,
        trade: 0,
        store_order: 0,
      },
      orphanMissedCall: 0,
      nonChatEventAttention: {
        tradeStatus: 0,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 0,
      },
      notificationAttentionTotal: 9,
      memberUnreadNotificationCount: 2,
    });
    expect(p.bellTotal).toBe(2);
    // Gate 3 Step 6 — notification axis = A only; rooms on messenger; no orphan re-add
    expect(p.appIcon.missedCall).toBe(2);
    expect(p.appIconTotal).toBe(1 + 2);
    expect(p.memberAppIconWebTotal).toBe(3);
  });

  it("unknown / owner_intake without store still excluded from A", () => {
    expect(
      isMemberNotificationAUnread(
        row({
          id: "u1",
          type: "weird_unknown_type",
          category: "weird",
          dedupe_key: "x",
        })
      )
    ).toBe(false);
    expect(
      isMemberNotificationAUnread(
        row({
          id: "oi",
          type: "order_status",
          attentionKey: undefined,
          display_payload: {
            legacyMeta: { kind: "store_order_created", order_id: "o9" },
          },
          dedupe_key: "commerce:owner:new_order:o9",
        })
      )
    ).toBe(false);
  });

  it("individual read decreases A count; re-read is idempotent", () => {
    const base = [
      row({ id: "a1", type: "trade_status", category: "trade_status", dedupe_key: "t1" }),
      row({ id: "a2", type: "admin_notice", category: "admin_notice", dedupe_key: "n1" }),
      row({ id: "a3", type: "security_alert", category: "security_alert", dedupe_key: "s1" }),
    ];
    expect(deriveMemberUnreadNotificationCount(base)).toBe(3);
    const afterOne = [
      { ...base[0]!, unread: false, read_at: "2026-01-01T00:00:00.000Z" },
      base[1]!,
      base[2]!,
    ];
    expect(deriveMemberUnreadNotificationCount(afterOne)).toBe(2);
    expect(deriveMemberUnreadNotificationCount(afterOne)).toBe(2);
  });

  it("mark-all A leaves B chat and owner_intake out of Bell", () => {
    const afterMarkAll = [
      {
        ...row({ id: "a1", type: "trade_status", category: "trade_status", dedupe_key: "t1" }),
        unread: false,
        read_at: "2026-01-01T00:00:00.000Z",
      },
      row({ id: "b1", type: "chat_message", category: "chat", room_id: "r1" }),
      row({
        id: "c1",
        type: "order_status",
        category: "order_status",
        dedupe_key: "commerce:owner:new_order:ox",
        display_payload: {
          legacyMeta: { kind: "store_order_created", order_id: "ox", store_id: "s1" },
        },
      }),
    ];
    expect(deriveMemberUnreadNotificationCount(afterMarkAll)).toBe(0);
    expect(isMemberNotificationAUnread(afterMarkAll[1]!)).toBe(false);
    expect(isMemberNotificationAUnread(afterMarkAll[2]!)).toBe(false);
  });

  it("delete unread A decreases count; delete already-read A does not", () => {
    const unread = row({
      id: "a1",
      type: "trade_status",
      category: "trade_status",
      dedupe_key: "t1",
    });
    const read = {
      ...row({ id: "a2", type: "admin_notice", category: "admin_notice", dedupe_key: "n1" }),
      unread: false,
      read_at: "2026-01-01T00:00:00.000Z",
    };
    expect(deriveMemberUnreadNotificationCount([unread, read])).toBe(1);
    const dismissedUnread = {
      ...unread,
      display_payload: { deleted_at: "2026-01-02T00:00:00.000Z" },
    };
    expect(deriveMemberUnreadNotificationCount([dismissedUnread, read])).toBe(0);
    const dismissedRead = {
      ...read,
      display_payload: { deleted_at: "2026-01-02T00:00:00.000Z" },
    };
    expect(deriveMemberUnreadNotificationCount([unread, dismissedRead])).toBe(1);
  });

  it("list filter keeps read A and drops chat/owner/unknown", () => {
    const inbox = [
      {
        id: "a1",
        notification_type: "trade_status",
        is_read: true,
        meta: {},
      },
      {
        id: "b1",
        notification_type: "chat",
        is_read: false,
        meta: {},
      },
      {
        id: "u1",
        notification_type: "weird_unknown_type",
        is_read: false,
        meta: {},
      },
      {
        id: "c1",
        notification_type: "order_status",
        is_read: false,
        meta: { kind: "store_order_created", order_id: "ox", store_id: "s1" },
        dedupe_key: "commerce:owner:new_order:ox",
      },
    ];
    expect(isMemberNotificationAListItem(memberNotificationAEventFromInboxRow(inbox[0]!))).toBe(
      true
    );
    const filtered = filterMemberNotificationAInboxRows(inbox);
    expect(filtered.map((r) => r.id)).toEqual(["a1"]);
  });

  it("legacy inbox type=system + bell_presentation_type=admin_notice stays in A list", () => {
    const inbox = [
      {
        id: "n20",
        notification_type: "system",
        type: "system",
        bell_presentation_type: "admin_notice",
        is_read: false,
        title: "P1 notice",
        body: "wire",
      },
      {
        id: "chat1",
        notification_type: "chat",
        is_read: false,
        room_id: "r1",
      },
    ];
    const mapped = memberNotificationAEventFromInboxRow(inbox[0]!);
    expect(mapped.type).toBe("admin_notice");
    expect(mapped.category).toBe("admin_notice");
    expect(isMemberNotificationAListItem(mapped)).toBe(true);
    expect(filterMemberNotificationAInboxRows(inbox).map((r) => r.id)).toEqual(["n20"]);
  });
});
