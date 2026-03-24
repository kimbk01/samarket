"use client";

/**
 * 현재 로그인 사용자의 profiles 행 일부 업데이트
 * RLS: 본인만 update. (관리자 회원관리에서 수정 시에도 동일 테이블 사용)
 */
import type { ProfileRow, ProfileUpdatePayload } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export type UpdateMyProfileResult = { ok: true } | { ok: false; error: string };

export async function updateMyProfile(
  payload: ProfileUpdatePayload
): Promise<UpdateMyProfileResult> {
  const userId = getCurrentUser()?.id;
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error)
        return { ok: false, error: (error as { message?: string }).message ?? "저장에 실패했습니다." };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message ?? "저장에 실패했습니다." };
    }
  }

  // Supabase 미연동: localStorage fallback (개발용, 회원관리와 동일 원본 연동 시 제거)
  try {
    const key = `kasama_profile_${userId}`;
    const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    const current: Partial<ProfileRow> = raw ? JSON.parse(raw) : {};
    const next = { ...current, ...payload, updated_at: new Date().toISOString() };
    if (typeof window !== "undefined") {
      localStorage.setItem(key, JSON.stringify(next));
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "저장에 실패했습니다." };
  }
}
