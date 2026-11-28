"use client";

import { useSyncExternalStore } from "react";
import type { Profile } from "@/lib/types/profile";
import { getSupabaseProfileCache, subscribeSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";

const serverSnapshot = (): Profile | null => null;

/**
 * 현재 로그인 사용자(프로필 캐시)를 화면 값으로 — 캐시가 바뀌면 다시 그린다.
 * 서버 그림·하이드레이션 첫 그림은 null(서버 HTML 과 같음), 그 뒤 캐시 값.
 * `mounted ? getCurrentUser() : …` 처럼 한 번만 읽으면 캐시가 늦게 찬 화면이 빈 값으로 남는다
 * (2026-11-28 글 상세 주소 직접 열기 — 관심이웃 안내 상자 미표시·입력줄 아바타 「?」).
 */
export function useClientProfile(): Profile | null {
  return useSyncExternalStore(subscribeSupabaseProfileCache, getSupabaseProfileCache, serverSnapshot);
}
