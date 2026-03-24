"use client";

/**
 * 설정 화면용 user_settings 조회
 * lib/settings/user-settings-store 의 getUserSettings 래핑 (동일 원본)
 */
import type { MySettings } from "./types";
import { getUserSettings as getStored } from "@/lib/settings/user-settings-store";

export function getMySettings(userId: string): MySettings {
  return getStored(userId);
}

/** re-export for components that need both */
export { getUserSettings } from "@/lib/settings/user-settings-store";
