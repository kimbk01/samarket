"use client";

import { useEffect } from "react";
import { ensureNotificationSoundRuntimeStarted } from "@/lib/notifications/notification-sound-decision";
import { unlockNotificationSoundAudio } from "@/lib/notifications/notification-sound-unlock";

/**
 * App-lifetime notification-sound tab leader + silent audio unlock.
 * DO NOT fold leader or unlock into NotificationSoundPrime (route-gated hydrate only).
 * Leader election and unlock must start before first ingest on every route.
 */
export function NotificationSoundLeaderBootstrap() {
  useEffect(() => {
    ensureNotificationSoundRuntimeStarted();

    const onFirstGesture = () => {
      unlockNotificationSoundAudio();
    };
    window.addEventListener("pointerdown", onFirstGesture, { passive: true, once: true });
    window.addEventListener("touchstart", onFirstGesture, { passive: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
    };
  }, []);

  return null;
}
