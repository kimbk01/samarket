/**
 * OS delivered notification tray removal — Capacitor PushNotifications.
 *
 * App Icon badge (Badge plugin / DibayBadgeNative) is separate from tray notifications.
 * Clearing App Icon must NOT be treated as clearing tray; clear tray by id/room/domain.
 */
"use client";

import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

export type DeliveredNotificationMatch = Readonly<{
  notificationId?: string | null;
  roomId?: string | null;
  domain?: string | null;
  domainIdentityKey?: string | null;
  eventId?: string | null;
}>;

function normalize(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** Coerce OS / payload ids (number | string) so string≠number mismatches do not skip removal. */
export function coerceNotificationId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim();
  return "";
}

function asDataStr(v: unknown): string {
  return coerceNotificationId(v);
}

function notificationMatches(
  data: Record<string, unknown> | undefined,
  osId: unknown,
  match: DeliveredNotificationMatch
): boolean {
  const d = data ?? {};
  const osIdStr = coerceNotificationId(osId);
  const wantNotif = normalize(match.notificationId);
  if (wantNotif) {
    if (osIdStr === wantNotif) return true;
    if (asDataStr(d.notificationId) === wantNotif || asDataStr(d.notification_id) === wantNotif) {
      return true;
    }
    // Android notification tag often carries the same logical id.
    if (asDataStr(d.tag) === wantNotif) return true;
  }
  const wantEvent = normalize(match.eventId);
  if (wantEvent && (asDataStr(d.eventId) === wantEvent || asDataStr(d.event_id) === wantEvent)) {
    return true;
  }
  const wantRoom = normalize(match.roomId);
  if (wantRoom) {
    const room = asDataStr(d.roomId) || asDataStr(d.room_id);
    if (room === wantRoom) {
      const wantDomain = normalize(match.domain).toLowerCase();
      if (!wantDomain) return true;
      const domain = (
        asDataStr(d.domain) ||
        asDataStr(d.chatDomain) ||
        asDataStr(d.chat_domain)
      ).toLowerCase();
      if (!domain || domain === wantDomain) return true;
    }
  }
  const wantIdentity = normalize(match.domainIdentityKey);
  if (
    wantIdentity &&
    (asDataStr(d.domainIdentityKey) === wantIdentity ||
      asDataStr(d.domain_identity_key) === wantIdentity)
  ) {
    return true;
  }
  return false;
}

/**
 * Remove matching delivered notifications from the OS tray.
 * Never calls removeAllDeliveredNotifications — other rooms stay.
 */
export async function removeDeliveredNotificationsMatching(
  match: DeliveredNotificationMatch
): Promise<number> {
  if (!isCapacitorNativePlatform()) return 0;
  const hasAny =
    normalize(match.notificationId) ||
    normalize(match.roomId) ||
    normalize(match.eventId) ||
    normalize(match.domainIdentityKey);
  if (!hasAny) return 0;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const delivered = await PushNotifications.getDeliveredNotifications();
    const toRemove = (delivered.notifications ?? []).filter((n) =>
      notificationMatches(
        (n.data ?? undefined) as Record<string, unknown> | undefined,
        n.id,
        match
      )
    );
    if (toRemove.length === 0) return 0;
    await PushNotifications.removeDeliveredNotifications({ notifications: toRemove });
    return toRemove.length;
  } catch {
    return 0;
  }
}

/**
 * Push tap — prefer removing the exact Capacitor notification object when provided,
 * then fall back to id/room/domain match (covers leftover duplicates).
 */
export async function removeDeliveredNotificationOnPushTap(input: {
  notificationId?: string | null;
  data?: Record<string, string | undefined> | null;
  /** Exact delivered notification from the tap action (Capacitor PushNotificationSchema). */
  tappedNotification?: { id?: string; data?: Record<string, unknown> } | null;
}): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  const data = input.data ?? {};
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    if (input.tappedNotification && coerceNotificationId(input.tappedNotification.id)) {
      try {
        await PushNotifications.removeDeliveredNotifications({
          notifications: [input.tappedNotification as never],
        });
      } catch {
        /* fall through to match-based removal */
      }
    }
  } catch {
    /* plugin unavailable */
  }
  await removeDeliveredNotificationsMatching({
    notificationId:
      coerceNotificationId(input.notificationId) ||
      coerceNotificationId(data.notificationId) ||
      coerceNotificationId(data.notification_id) ||
      null,
    roomId: data.roomId || data.room_id || null,
    domain: data.domain || data.chatDomain || data.chat_domain || null,
    domainIdentityKey: data.domainIdentityKey || data.domain_identity_key || null,
    eventId: data.eventId || data.event_id || null,
  });
}

/** Room read success — remove tray notifications for that domain+room. */
export async function removeDeliveredNotificationsForRoomRead(input: {
  roomId: string;
  domain?: string | null;
  domainIdentityKey?: string | null;
}): Promise<number> {
  const roomId = input.roomId.trim();
  if (!roomId) return 0;
  return removeDeliveredNotificationsMatching({
    roomId,
    domain: input.domain ?? null,
    domainIdentityKey: input.domainIdentityKey ?? null,
  });
}

/** Test helper — exported match predicate with id coercion. */
export function matchDeliveredNotificationForTest(
  data: Record<string, unknown> | undefined,
  osId: unknown,
  match: DeliveredNotificationMatch
): boolean {
  return notificationMatches(data, osId, match);
}
