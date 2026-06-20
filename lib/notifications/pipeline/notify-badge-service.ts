import type { SupabaseClient } from "@supabase/supabase-js";
import { countNotificationEventsBadge } from "@/lib/notifications/core/notification-event-repository";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";

const badgeCache = new Map<string, { at: number; value: NotificationBadgeCount }>();
const CACHE_MS = 3_000;

const EMPTY: NotificationBadgeCount = {
  total: 0,
  chatMessage: 0,
  groupMessage: 0,
  tradeMessage: 0,
  tradeStatus: 0,
  orderStatus: 0,
  deliveryStatus: 0,
  communityActivity: 0,
  adminMarketingBanner: 0,
  adminNotice: 0,
  chat: 0,
  group: 0,
  trade: 0,
  store: 0,
  missedCall: 0,
};

export async function fetchNotificationBadgeCount(
  sb: SupabaseClient<any>,
  userId: string,
  opts?: { force?: boolean }
): Promise<NotificationBadgeCount> {
  const uid = userId.trim();
  if (!uid) return EMPTY;
  const now = Date.now();
  if (!opts?.force) {
    const cached = badgeCache.get(uid);
    if (cached && now - cached.at < CACHE_MS) return cached.value;
  }
  const value = await countNotificationEventsBadge(sb, uid);
  badgeCache.set(uid, { at: now, value });
  logNotifyBadge("server_count", { userId: uid, ...value });
  return value;
}

export function invalidateNotificationBadgeCache(userId: string): void {
  badgeCache.delete(userId.trim());
}

export function resetNotificationBadgeCacheForTests(): void {
  badgeCache.clear();
}
