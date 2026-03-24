"use client";

/**
 * 설정 화면·배너 닫기 등 user_settings 업데이트
 * lib/settings/user-settings-store 의 updateUserSettings 래핑 (동일 원본)
 */
import type { MySettings } from "./types";
import { updateUserSettings as updateStored } from "@/lib/settings/user-settings-store";

export function updateMySettings(
  userId: string,
  partial: MySettings
): void {
  updateStored(userId, partial);
}
