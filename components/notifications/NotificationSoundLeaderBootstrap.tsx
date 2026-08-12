"use client";

import { ensureNotificationSoundRuntimeStarted } from "@/lib/notifications/notification-sound-decision";

/**
 * App-lifetime notification-sound tab leader.
 * DO NOT fold this into NotificationSoundPrime (audio unlock / SSOT hydrate, route-gated).
 * Leader election must start before first ingest on every route, including /market and /admin.
 */
export function NotificationSoundLeaderBootstrap() {
  if (typeof window !== "undefined") {
    ensureNotificationSoundRuntimeStarted();
  }
  return null;
}
