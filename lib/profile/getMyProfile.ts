"use client";

/**
 * 현재 로그인 사용자의 profiles 행 조회
 * RLS: 본인만 select. (관리자 회원관리에서는 전체 조회 가능하도록 확장 시 동일 테이블 사용)
 */
import type { ProfileRow } from "./types";
import { DEFAULT_PROFILE_ROW } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function getMyProfile(): Promise<ProfileRow | null> {
  const userId = getCurrentUser()?.id;
  if (!userId) return null;

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (!error && data) return data as ProfileRow;
      if (error && (error as { code?: string }).code !== "PGRST116") return null;
    } catch {
      return null;
    }
  }

  // Supabase 미연동: localStorage(updateMyProfile과 동일 키) + getCurrentUser 기반 폴백
  const u = getCurrentUser();
  if (!u) return null;
  const key = `kasama_profile_${userId}`;
  let stored: Partial<ProfileRow> = {};
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(key);
      if (raw) stored = JSON.parse(raw);
    } catch {
      // ignore
    }
  }
  return {
    ...DEFAULT_PROFILE_ROW,
    id: u.id,
    email: u.email ?? null,
    nickname: u.nickname ?? null,
    avatar_url: u.avatar_url ?? null,
    updated_at: new Date().toISOString(),
    ...stored,
  } as ProfileRow;
}
