import { describe, expect, it } from "vitest";
import {
  mapNotificationEventToInboxRow,
  resolveEventInboxLinkUrl,
  isInboxDismissedNotificationEvent,
  type NotificationEventInboxSource,
} from "@/lib/notifications/inbox-events-merge";
import {
  resolveInboxBellThreadRead,
  extractRoomIdFromInboxLink,
  inboxBellThreadReadDedupeKey,
} from "@/lib/notifications/inbox-read-bridge";
import { resolveNotificationInboxHref } from "@/lib/notifications/resolve-notification-inbox-href";

function baseEvent(overrides: Partial<NotificationEventInboxSource> = {}): NotificationEventInboxSource {
  return {
    id: "evt-1",
    type: "community_activity",
    category: "community_activity",
    title: "comment",
    body: "hi",
    display_payload: { legacyMeta: { post_id: "post-1" }, legacyPushKind: "community" },
    read_at: null,
    created_at: "2026-06-30T10:00:00.000Z",
    dedupe_key: "c:1",
    room_id: null,
    ...overrides,
  };
}

describe("Legacy bell P0 — thread read plans", () => {
  it("community row → community_post_opened", () => {
    const row = mapNotificationEventToInboxRow(baseEvent());
    expect(resolveInboxBellThreadRead(row)).toEqual({
      threadId: "post-1",
      threadType: "community_post",
      readReason: "community_post_opened",
    });
  });

  it("trade_status row → trade_detail_opened", () => {
    const row = mapNotificationEventToInboxRow(
      baseEvent({
        type: "trade_status",
        category: "trade_status",
        display_payload: {
          legacyPushKind: "trade",
          legacyMeta: { product_id: "prod-1" },
        },
      })
    );
    expect(resolveInboxBellThreadRead(row)).toMatchObject({
      threadId: "prod-1",
      threadType: "trade_room",
      readReason: "trade_detail_opened",
    });
  });

  it("order_status row → order_detail_opened", () => {
    const row = mapNotificationEventToInboxRow(
      baseEvent({
        type: "order_status",
        category: "order_status",
        display_payload: {
          legacyPushKind: "delivery",
          legacyMeta: { order_id: "ord-1" },
        },
      })
    );
    expect(resolveInboxBellThreadRead(row)).toEqual({
      threadId: "ord-1",
      threadType: "order",
      readReason: "order_detail_opened",
    });
  });

  it("chat row → chat_room_visible", () => {
    const row = mapNotificationEventToInboxRow(
      baseEvent({
        type: "chat_message",
        category: "chat_message",
        room_id: "room-1",
        display_payload: {
          routeUrl: "/community-messenger/rooms/room-1",
          legacyNotificationType: "chat",
          legacyPushKind: "chat",
          legacyMeta: { kind: "community_chat", room_id: "room-1" },
        },
      })
    );
    expect(resolveInboxBellThreadRead(row)).toMatchObject({
      threadId: "room-1",
      threadType: "chat_room",
      readReason: "chat_room_visible",
    });
  });

  it("dedupes identical thread read keys", () => {
    const plan = {
      threadId: "room-1",
      threadType: "chat_room" as const,
      readReason: "chat_room_visible" as const,
      categories: ["chat_message", "group_message"],
    };
    const a = inboxBellThreadReadDedupeKey(plan);
    const b = inboxBellThreadReadDedupeKey({ ...plan, categories: ["group_message", "chat_message"] });
    expect(a).toBe(b);
  });
});

describe("Legacy bell P0 — href mapping", () => {
  it("community post meta → /philife/{postId}", () => {
    expect(resolveEventInboxLinkUrl(baseEvent())).toBe("/philife/post-1");
  });

  it("order_status with order_id → buyer order detail", () => {
    expect(
      resolveEventInboxLinkUrl(
        baseEvent({
          type: "order_status",
          category: "order_status",
          display_payload: { legacyMeta: { order_id: "ord-9" }, legacyPushKind: "delivery" },
          room_id: null,
        })
      )
    ).toBe("/mypage/store-orders/ord-9");
  });

  it("buyer commerce legacy href keeps order detail path", () => {
    expect(
      resolveNotificationInboxHref({
        notification_type: "commerce",
        link_url: "/mypage/store-orders/ord-42",
        meta: { kind: "store_order_owner_status", order_id: "ord-42" },
      })
    ).toBe("/mypage/store-orders/ord-42");
  });

  it("extracts room id from messenger link", () => {
    expect(extractRoomIdFromInboxLink("/community-messenger/rooms/abc-123")).toBe("abc-123");
  });
});

describe("Legacy bell P0 — event inbox dismiss", () => {
  it("detects dismissed events by inbox_dismissed_at", () => {
    expect(
      isInboxDismissedNotificationEvent(
        baseEvent({
          display_payload: { inbox_dismissed_at: "2026-07-08T00:00:00.000Z" },
        })
      )
    ).toBe(true);
  });
});
