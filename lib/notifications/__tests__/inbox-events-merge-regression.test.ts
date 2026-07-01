import { describe, expect, it } from "vitest";
import {
  mapNotificationEventToInboxRow,
  mergeInboxNotificationRows,
  resolveEventInboxLinkUrl,
  type InboxNotificationRow,
  type NotificationEventInboxSource,
} from "@/lib/notifications/inbox-events-merge";
import {
  partitionInboxReadIdsFromLookup,
} from "@/lib/notifications/inbox-read-bridge";

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

  it("partitions read ids by lookup sets", () => {
    const legacySet = new Set(["legacy-a"]);
    const eventSet = new Set(["evt-b"]);
    const result = partitionInboxReadIdsFromLookup(["legacy-a", "evt-b", "unknown-c"], legacySet, eventSet);
    expect(result.legacyIds).toEqual(["legacy-a"]);
    expect(result.eventIds).toEqual(["evt-b", "unknown-c"]);
  });

  it("resolves friend request href fallback", () => {
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
    expect(href).toBe("/community-messenger?section=friends");
  });

  it("resolves order href fallback", () => {
    const href = resolveEventInboxLinkUrl(
      baseEvent({
        type: "order_status",
        category: "order_status",
        display_payload: { legacyPushKind: "delivery" },
        room_id: null,
      })
    );
    expect(href).toBe("/my/store-orders");
  });

  it("resolves community post href from meta", () => {
    const href = resolveEventInboxLinkUrl(
      baseEvent({
        type: "community_activity",
        category: "community_activity",
        display_payload: {
          legacyMeta: { post_id: "post-99" },
          routeUrl: "/philife/posts/post-99",
        },
        room_id: null,
      })
    );
    expect(href).toBe("/philife/posts/post-99");
  });
});
