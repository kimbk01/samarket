"use client";

/**
 * 현재 로그인 사용자의 profiles 행 조회
 * RLS: 본인만 select. (관리자 회원관리에서는 전체 조회 가능하도록 확장 시 동일 테이블 사용)
 */
import type { ProfileRow } from "./types";
import { DEFAULT_PROFILE_ROW } from "./types";
import { fetchProfileRowSafe } from "./fetch-profile-row-safe";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";

export async function getMyProfile(): Promise<ProfileRow | null> {
  const userId = getCurrentUser()?.id;
  if (!userId) return null;

  /** 아이디 로그인 등 JWT 가 없을 때는 클라이언트 select 도 RLS 로 막힘 — 서버 API 가 우선 */
  const hasSupabaseProject = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  if (typeof window !== "undefined" && hasSupabaseProject) {
    try {
      const { status, json: raw } = await fetchMeProfileDeduped();
      const json = raw as { ok?: boolean; profile?: ProfileRow | null; error?: string } | null;
      if (status >= 200 && status < 300 && json?.ok && json.profile != null) {
        return json.profile as ProfileRow;
      }
      if (status >= 200 && status < 300 && json?.ok && json.profile === null) {
        return null;
      }
    } catch {
      /* fall through */
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const fromDb = await fetchProfileRowSafe(supabase, userId);
      if (fromDb) return fromDb;
    } catch {
      /* fall through */
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
