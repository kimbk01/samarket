"use client";

import { useEffect } from "react";
import { ensureNotificationSoundSsotHydratedForClient } from "@/lib/notifications/notification-sound-ssot-client-hydrate";

/**
 * Route-gated SSOT hydrate only — NOT audio unlock.
 * Unlock authority: `NotificationSoundLeaderBootstrap` (app lifetime, route-independent).
 */
export function NotificationSoundPrime() {
  useEffect(() => {
    void ensureNotificationSoundSsotHydratedForClient();
    const onFirstGesture = () => {
      void ensureNotificationSoundSsotHydratedForClient();
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
