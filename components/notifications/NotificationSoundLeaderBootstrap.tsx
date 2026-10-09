"use client";

import { useEffect } from "react";
import { ensureNotificationSoundRuntimeStarted } from "@/lib/notifications/notification-sound-decision";
import { unlockNotificationSoundAudio } from "@/lib/notifications/notification-sound-unlock";
import { subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { armNotificationSoundSsotFirstLoad } from "@/lib/notifications/notification-sound-ssot-client-hydrate";

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
    /**
     * W1-b — login that does not re-run App Boot (boot already `anonymous`) must still start the
     * admin SSOT first load. Same single owner as boot completion (single-flight / TTL dedupe).
     */
    const unsubPhase = subscribeSessionPhase((phase) => {
      if (phase === "authenticated") armNotificationSoundSsotFirstLoad("session_authenticated");
    });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      unsubPhase();
    };
  }, []);

  return null;
}
