"use client";

import { useEffect } from "react";
import { primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";

/** 앱 내 첫 제스처에서 알림 사운드 프리로드·오디오 잠금 해제(iOS/WebKit) */
export function NotificationSoundPrime() {
  useEffect(() => {
    const onFirstGesture = () => {
      primeNotificationSoundAudio();
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
