"use client";

import { getAppSettings } from "@/lib/app-settings";
import { isAdminAlarmMuted } from "@/lib/admin-ui-prefs";

/**
 * 알람 사운드 재생 (관리자 일반설정에서 등록한 MP3)
 * - alarmSoundDataUrl 이 있으면 재생, 없으면 무시
 * - 관리자 상단「알람 음소거」가 켜져 있으면 재생하지 않음
 */
export function playAlarmSound(): void {
  if (typeof window === "undefined") return;
  if (isAdminAlarmMuted()) return;
  const settings = getAppSettings();
  const src = settings.alarmSoundDataUrl?.trim();
  if (!src) return;
  try {
    const audio = new Audio(src);
    audio.volume = 0.8;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}
