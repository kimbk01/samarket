import type { SupabaseClient } from "@supabase/supabase-js";
import {
  markAllMissedCallEventsRead,
  markMissedCallEventsRead,
  markNotificationEventRead,
  markNotificationEventsReadByCategory,
  markNotificationEventsReadByThread,
  markOrderNotificationEventsRead,
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
  opts: { roomId?: string; callSessionId?: string; scope?: "call_logs" }
): Promise<number> {
  const count =
    opts.scope === "call_logs"
      ? await markAllMissedCallEventsRead(sb, userId)
      : await markMissedCallEventsRead(sb, userId, opts);
  if (count > 0) {
    invalidateNotificationBadgeCache(userId);
    logMissedCall("read_marked", { userId, ...opts, count });
    await fetchNotificationBadgeCount(sb, userId, { force: true });
  }
  return count;
}

export async function markNotificationCategoryRead(
  sb: SupabaseClient<any>,
  userId: string,
  category: string
): Promise<number> {
  const count = await markNotificationEventsReadByCategory(sb, userId, category);
  if (count > 0) {
    invalidateNotificationBadgeCache(userId);
    logNotifyBadge("read_clear", { userId, category, count });
    await fetchNotificationBadgeCount(sb, userId, { force: true });
  }
  return count;
}

export async function markOrderNotificationsRead(
  sb: SupabaseClient<any>,
  userId: string,
  orderId: string
): Promise<number> {
  const count = await markOrderNotificationEventsRead(sb, userId, orderId);
  if (count > 0) {
    invalidateNotificationBadgeCache(userId);
    logNotifyBadge("read_clear", { userId, orderId, count });
    await fetchNotificationBadgeCount(sb, userId, { force: true });
  }
  return count;
}

export async function markNotificationThreadRead(
  sb: SupabaseClient<any>,
  userId: string,
  threadId: string
): Promise<number> {
  const count = await markNotificationEventsReadByThread(sb, userId, threadId);
  if (count > 0) {
    invalidateNotificationBadgeCache(userId);
    logNotifyBadge("read_clear", { userId, threadId, count });
    await fetchNotificationBadgeCount(sb, userId, { force: true });
  }
  return count;
}
