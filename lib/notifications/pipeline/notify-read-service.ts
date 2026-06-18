import type { SupabaseClient } from "@supabase/supabase-js";
import {
  markMissedCallEventsRead,
  markNotificationEventRead,
  markRoomNotificationEventsRead,
} from "@/lib/notifications/core/notification-event-repository";
import { logMissedCall, logNotifyBadge } from "@/lib/notifications/core/notification-logs";
import {
  fetchNotificationBadgeCount,
  invalidateNotificationBadgeCache,
} from "@/lib/notifications/pipeline/notify-badge-service";

export async function markNotificationRead(
  sb: SupabaseClient<any>,
  userId: string,
  notificationEventId: string,
  opts?: { openedAt?: boolean }
): Promise<boolean> {
  const ok = await markNotificationEventRead(sb, userId, notificationEventId, opts);
  if (ok) {
    invalidateNotificationBadgeCache(userId);
    logNotifyBadge("read_clear", { userId, notificationEventId });
    await fetchNotificationBadgeCount(sb, userId, { force: true });
  }
  return ok;
}

export async function markRoomRead(
  sb: SupabaseClient<any>,
  userId: string,
  roomId: string
): Promise<number> {
  const count = await markRoomNotificationEventsRead(sb, userId, roomId);
  if (count > 0) {
    invalidateNotificationBadgeCache(userId);
    logNotifyBadge("read_clear", { userId, roomId, count });
    await fetchNotificationBadgeCount(sb, userId, { force: true });
  }
  return count;
}

export async function markMissedCallsRead(
  sb: SupabaseClient<any>,
  userId: string,
  opts: { roomId?: string; callSessionId?: string }
): Promise<number> {
  const count = await markMissedCallEventsRead(sb, userId, opts);
  if (count > 0) {
    invalidateNotificationBadgeCache(userId);
    logMissedCall("read_marked", { userId, ...opts, count });
    await fetchNotificationBadgeCount(sb, userId, { force: true });
  }
  return count;
}
