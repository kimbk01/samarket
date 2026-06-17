"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";

/**
 * app-boot·SupabaseAuthSync 가 채운 프로필 캐시 — membership `checking` 중 UI 게이트 완화용.
 * `ensureSessionHealthy` 와 분리해 거래·배달·채팅이 세션 single-flight 에 묶이지 않게 한다.
 */
export function peekOptimisticMemberViewerId(): string | null {
  const id = getCurrentUser()?.id?.trim();
  return id || null;
}

export function isOptimisticMemberViewer(): boolean {
  return peekOptimisticMemberViewerId() != null;
}
