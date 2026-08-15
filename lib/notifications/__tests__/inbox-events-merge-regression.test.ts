import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapNotificationEventToInboxRow,
  mergeInboxNotificationRows,
  mergeInboxNotificationRowsEventsPrimary,
  resolveEventInboxLinkUrl,
  type InboxNotificationRow,
  type NotificationEventInboxSource,
} from "@/lib/notifications/inbox-events-merge";
import {
  partitionInboxReadIdsFromLookup,
} from "@/lib/notifications/inbox-read-bridge";
import { resolveNotificationSoundEventKeyFromRow } from "@/lib/notifications/notification-sound-event-key-from-row";

function baseEvent(overrides: Partial<NotificationEventInboxSource> = {}): NotificationEventInboxSource {
  return {
    id: "evt-dm-1",
    type: "chat_message",
    category: "chat_message",
    title: "New message",
    body: "hello",
    display_payload: {
      routeUrl: "/community-messenger/rooms/room-1",
      legacyNotificationType: "chat",
      legacyPushKind: "chat",
      legacyMeta: { kind: "community_chat", room_id: "room-1" },
    },
    read_at: null,
    created_at: "2026-06-30T10:00:00.000Z",
    dedupe_key: "msg:room-1:msg-1",
    room_id: "room-1",
    ...overrides,
  };
}

describe("inbox-events-merge-regression", () => {
  it("maps events-only row with routeUrl link and source=event", () => {
    const row = mapNotificationEventToInboxRow(baseEvent());
    expect(row.id).toBe("evt-dm-1");
    expect(row.source).toBe("event");
    expect(row.link_url).toBe("/community-messenger/rooms/room-1");
    expect(row.is_read).toBe(false);
    expect(row.notification_type).toBe("chat");
    expect(row.push_kind).toBe("chat");
  });

  it("keeps legacy rows in merge unchanged", () => {
    const legacy: InboxNotificationRow = {
      id: "legacy-1",
      notification_type: "system",
      title: "Legacy",
      body: "body",
      link_url: "/foo",
      is_read: false,
      created_at: "2026-06-30T09:00:00.000Z",
    };
    const event = mapNotificationEventToInboxRow(
      baseEvent({ id: "evt-2", dedupe_key: "other-key", created_at: "2026-06-30T11:00:00.000Z" })
    );
    const merged = mergeInboxNotificationRows([legacy], [event]);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.id === "legacy-1")?.source).toBe("legacy");
    expect(merged[0]?.id).toBe("evt-2");
  });

  it("prefers event over legacy when dedupe_key matches", () => {
    const legacy: InboxNotificationRow = {
      id: "legacy-dup",
      notification_type: "chat",
      title: "Legacy dup",
      body: null,
      link_url: "/old",
      is_read: false,
      created_at: "2026-06-30T12:00:00.000Z",
      dedupe_key: "msg:room-1:msg-1",
    };
    const event = mapNotificationEventToInboxRow(baseEvent());
    const merged = mergeInboxNotificationRows([legacy], [event]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("evt-dm-1");
    expect(merged[0]?.source).toBe("event");
  });

  it("exposes an events-primary merge with legacy compatibility tail", () => {
    const event = mapNotificationEventToInboxRow(baseEvent());
    const legacy: InboxNotificationRow = {
      id: "legacy-only",
      notification_type: "system",
      title: "Legacy only",
      body: null,
      link_url: "/notifications",
      is_read: false,
      created_at: "2026-06-30T09:00:00.000Z",
    };
    const merged = mergeInboxNotificationRowsEventsPrimary(
      [event],
      [legacy]
    );
    expect(merged.map((row) => row.source)).toEqual(["event", "legacy"]);
  });

  it("partitions read ids by lookup sets", () => {
    const legacySet = new Set(["legacy-a"]);
    const eventSet = new Set(["evt-b"]);
    const result = partitionInboxReadIdsFromLookup(["legacy-a", "evt-b", "unknown-c"], legacySet, eventSet);
    expect(result.legacyIds).toEqual(["legacy-a"]);
    expect(result.eventIds).toEqual(["evt-b", "unknown-c"]);
  });

  it("Phase2 appNoticeId maps to Customer Center notice Detail (no /mypage/notices bridge)", () => {
    const href = resolveEventInboxLinkUrl(
      baseEvent({
        type: "admin_notice",
        category: "admin_notice",
        display_payload: {
          routeUrl: "/https://samarket.vercel.app/mypage/notices/notice-1",
          appNoticeId: "notice-1",
        },
        room_id: null,
      })
    );
    expect(href).toBe("/mypage/customer-center/notice/notice-1");
  });

  it("Customer Center content bind uses canonical board route", () => {
    const href = resolveEventInboxLinkUrl(
      baseEvent({
        type: "admin_marketing_banner",
        category: "admin_marketing_banner",
        display_payload: {
          appNoticeId: "mkt-1",
          content_id: "mkt-1",
          content_type: "marketing",
          canonical_route: "/mypage/customer-center/marketing/mkt-1",
          routeUrl: "/community",
        },
        room_id: null,
      })
    );
    expect(href).toBe("/mypage/customer-center/marketing/mkt-1");
  });

  it("admin_notice without content id uses origin-unavailable fallback (not notices list)", () => {
    const href = resolveEventInboxLinkUrl(
      baseEvent({
        type: "admin_notice",
        category: "admin_notice",
        display_payload: {
          legacyMeta: { kind: "friend_request", request_id: "req-1" },
        },
        room_id: null,
      })
    );
    expect(href).toBe("/notifications?fallback=origin_unavailable");
  });

  it("notification-only campaign with bare notifications route opens notification detail", () => {
    const href = resolveEventInboxLinkUrl(
      baseEvent({
        id: "evt-notice-only",
        type: "notice_published",
        category: "notice_published",
        display_payload: {
          campaignType: "notice",
          routeUrl: "/notifications",
          previewKind: "admin_campaign",
        },
        room_id: null,
      })
    );
    expect(href).toBe("/notifications/evt-notice-only");
  });

  it("system campaignType + appNoticeId maps to system board Detail", () => {
    const href = resolveEventInboxLinkUrl(
      baseEvent({
        type: "admin_notice",
        category: "admin_notice",
        display_payload: {
          appNoticeId: "sys-1",
          campaignType: "system",
        },
        room_id: null,
      })
    );
    expect(href).toBe("/mypage/customer-center/system/sys-1");
  });

  it("content_id authority is app notice id — never notification event id", () => {
    const href = resolveEventInboxLinkUrl(
      baseEvent({
        id: "evt-NOT-CONTENT",
        type: "admin_notice",
        category: "admin_notice",
        display_payload: {
          content_id: "content-row-99",
          content_type: "notice",
        },
        room_id: null,
      })
    );
    expect(href).toBe("/mypage/customer-center/notice/content-row-99");
    expect(href).not.toContain("evt-NOT-CONTENT");
  });

  it("resolves community post href from meta", () => {
    const href = resolveEventInboxLinkUrl(
      baseEvent({
        type: "community_activity",
        category: "community_activity",
        display_payload: {
          legacyMeta: { post_id: "post-99" },
        },
        room_id: null,
      })
    );
    expect(href).toBe("/community/posts/post-99");
  });

  it("resolves order href with order id", () => {
    const href = resolveEventInboxLinkUrl(
      baseEvent({
        type: "order_status",
        category: "order_status",
        display_payload: {
          legacyMeta: { order_id: "ord-55" },
          legacyPushKind: "delivery",
        },
        room_id: null,
      })
    );
    expect(href).toBe("/mypage/store-orders/ord-55");
  });

  it("maps production trade_legacy roomKind to trade chat sound eventKey", () => {
    const row = mapNotificationEventToInboxRow(
      baseEvent({
        type: "trade_message",
        category: "trade_message",
        display_payload: {
          roomKind: "trade_legacy",
          routeUrl: "/chats/product/trade-room-1",
        },
        room_id: "trade-room-1",
      })
    );

    expect(row.meta?.kind).toBe("trade_chat");
    expect(resolveNotificationSoundEventKeyFromRow(row)).toBe("trade_chat_message_received");
  });

  it("does not collapse store_order roomKind to messenger direct sound", () => {
    const row = mapNotificationEventToInboxRow(
      baseEvent({
        type: "store_order_message",
        category: "order_status",
        display_payload: {
          roomKind: "store_order",
          routeUrl: "/community-messenger/rooms/store-order-room-1",
        },
        room_id: "store-order-room-1",
      })
    );

    expect(row.meta?.kind).toBe("store_order_message");
    expect(row.meta?.kind).not.toBe("community_chat");
    expect(resolveNotificationSoundEventKeyFromRow(row)).toBe("delivery_chat_message_received_user");
    expect(resolveNotificationSoundEventKeyFromRow(row)).not.toBe("messenger_direct_message_received");
  });

  it("keeps direct and group roomKind sound mapping unchanged", () => {
    const direct = mapNotificationEventToInboxRow(
      baseEvent({
        display_payload: { roomKind: "direct" },
        room_id: "direct-room-1",
      })
    );
    const group = mapNotificationEventToInboxRow(
      baseEvent({
        type: "group_message",
        category: "group_message",
        display_payload: { roomKind: "group" },
        room_id: "group-room-1",
      })
    );

    expect(direct.meta?.kind).toBe("community_chat");
    expect(resolveNotificationSoundEventKeyFromRow(direct)).toBe("messenger_direct_message_received");
    expect(group.meta?.kind).toBe("group_chat");
    expect(resolveNotificationSoundEventKeyFromRow(group)).toBe("messenger_group_message_received");
  });

  it("maps chat_message roomKind to Bell presentation subtypes", () => {
    expect(
      mapNotificationEventToInboxRow(
        baseEvent({ display_payload: { roomKind: "direct" } })
      ).bell_presentation_type
    ).toBe("general_message");
    expect(
      mapNotificationEventToInboxRow(
        baseEvent({
          type: "group_message",
          category: "group_message",
          display_payload: { roomKind: "group" },
        })
      ).bell_presentation_type
    ).toBe("group_message");
    expect(
      mapNotificationEventToInboxRow(
        baseEvent({
          type: "store_order_message",
          category: "order_status",
          display_payload: { roomKind: "store_order", viewerRole: "owner" },
        })
      ).bell_presentation_type
    ).toBe("owner_order_message");
    expect(
      mapNotificationEventToInboxRow(
        baseEvent({
          type: "order_status",
          category: "order_status",
          display_payload: {
            legacyMeta: { kind: "store_order_created", order_id: "o1", store_id: "s1" },
            legacyRefId: "o1",
            routeUrl: "/stores/owner/orders?storeId=s1&order_id=o1",
          },
        })
      ).bell_presentation_type
    ).toBe("owner_order_status");
    expect(
      mapNotificationEventToInboxRow(
        baseEvent({
          type: "order_status",
          category: "order_status",
          display_payload: {
            legacyMeta: { kind: "store_order_owner_status", order_id: "o2" },
            legacyRefId: "o2",
          },
        })
      ).bell_presentation_type
    ).toBe("customer_order_status");
    expect(
      mapNotificationEventToInboxRow(
        baseEvent({ type: "order_status", category: "order_status" })
      ).bell_presentation_type
    ).toBe("customer_order_status");
  });

  it("documents that merge helper is quarantine-only; product route is events-only", () => {
    const merge = readFileSync(
      join(process.cwd(), "lib/notifications/inbox-events-merge.ts"),
      "utf8"
    );
    expect(merge).toContain("Product Bell GET must NOT call this with legacy");
  });
});
