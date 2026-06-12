"use client";

import { getCurrentUser, getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";

/** 클라이언트 뷰어 UUID — mock `"me"` 대신 Supabase 세션·프로필 캐시 사용 */
export function getViewerUserId(): string {
  if (typeof window === "undefined") return "";
  return getCurrentUser()?.id?.trim() ?? getSyncViewerUserIdForClient()?.trim() ?? "";
}

/** @deprecated `getViewerUserId` 사용 */
export function getCurrentUserId(): string {
  return getViewerUserId();
}
