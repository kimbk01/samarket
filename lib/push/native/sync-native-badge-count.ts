"use client";

import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

function clampBadgeCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(999, Math.floor(count)));
}

/** 앱 아이콘 badge — iOS/Android(launcher 지원 기기). OS API 위임, 실패 시 no-op. */
export async function syncNativeBadgeCount(count: number): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  const value = clampBadgeCount(count);
  try {
    const { Badge } = await import("@capawesome/capacitor-badge");
    if (value <= 0) {
      await Badge.clear();
      return;
    }
    await Badge.set({ count: value });
  } catch {
    /* plugin 미동기화·미지원 기기 */
  }
}

export async function clearNativeBadgeCount(): Promise<void> {
  await syncNativeBadgeCount(0);
}
