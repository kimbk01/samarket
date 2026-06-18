import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { shouldSkipPushForEventDedupe } from "@/lib/notifications/core/notification-dedupe";
import { logNotifyMessage } from "@/lib/notifications/core/notification-logs";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import {
  buildChatRoomWebPath,
  buildMissedCallWebPath,
} from "@/lib/notifications/policy/notification-deeplink-policy";
import { buildGroupRoomWebPath } from "@/lib/community-messenger/group/group-room-deeplink";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { fetchNotificationBadgeCount } from "@/lib/notifications/pipeline/notify-badge-service";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { getSiteOrigin } from "@/lib/env/runtime";

function absolutizeLink(link: string): string | null {
  const base = getSiteOrigin();
  if (!base) return null;
  return link.startsWith("/") ? `${base}${link}` : `${base}/${link}`;
}

function buildPushPayload(row: NotificationEventRow, badgeCount: number): NotificationSideEffectPayloadOut {
  const roomId = row.room_id ?? "";
  const link_url =
    row.type === "missed_call" && roomId && row.call_session_id
      ? buildMissedCallWebPath(roomId, row.call_session_id)
      : row.type === "group_message" && roomId
        ? buildGroupRoomWebPath(roomId)
        : roomId
          ? buildChatRoomWebPath(roomId)
          : "/community-messenger";
  return {
    user_id: row.user_id,
    notification_type:
      row.type === "missed_call" ? "community_messenger_missed_call" : "chat",
    title: row.title,
    body: row.body,
    link_url,
    link_url_absolute: absolutizeLink(link_url),
    occurred_at: row.created_at,
    meta: {
      kind: row.type,
      room_id: roomId,
      notification_event_id: row.id,
      notification_id: row.id,
      message_id: row.message_id,
      session_id: row.call_session_id,
      badge_count: badgeCount,
    },
  };
}

export async function dispatchNotificationPushIfAllowed(
  sb: SupabaseClient<any>,
  row: NotificationEventRow,
  opts?: { callPushKind?: "missed_call" }
): Promise<void> {
  if (row.push_suppressed_reason) {
    logNotifyMessage("push_dispatch_done", {
      userId: row.user_id,
      eventId: row.id,
      skipped: row.push_suppressed_reason,
    });
    return;
  }
  if (shouldSkipPushForEventDedupe(row.id)) {
    logNotifyMessage("push_dispatch_done", { userId: row.user_id, eventId: row.id, skipped: "dedupe" });
    return;
  }

  logNotifyMessage("push_dispatch_start", { userId: row.user_id, eventId: row.id });
  const badge = await fetchNotificationBadgeCount(sb, row.user_id, { force: true });
  const out = buildPushPayload(row, badge.total);

  if (opts?.callPushKind === "missed_call") {
    await dispatchPushForUser(out, {
      event_type: "missed_call",
      target_type: "call_session",
      target_id: row.call_session_id ?? undefined,
      call_push_kind: "missed_call",
      badge_count: badge.total,
      notification_event_id: row.id,
    });
  } else {
    await dispatchPushForUser(out, {
      badge_count: badge.total,
      notification_event_id: row.id,
    });
  }

  logNotifyMessage("push_dispatch_done", {
    userId: row.user_id,
    eventId: row.id,
    badgeCount: badge.total,
  });
}

export type { NotificationEventType };
