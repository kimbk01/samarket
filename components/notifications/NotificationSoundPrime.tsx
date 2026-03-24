"use client";

import { useEffect } from "react";
import { primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";

/** 앱 내 첫 포인터 제스처에서 알림 MP3를 프리로드 */
export function NotificationSoundPrime() {
  useEffect(() => {
    const onFirstGesture = () => {
      primeNotificationSoundAudio();
    };
    window.addEventListener("pointerdown", onFirstGesture, { passive: true, once: true });
    return () => window.removeEventListener("pointerdown", onFirstGesture);
  }, []);
  return null;
}
