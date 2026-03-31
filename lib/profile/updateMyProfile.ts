"use client";

/**
 * 현재 로그인 사용자의 profiles 행 일부 업데이트
 * RLS: 본인만 update. (관리자 회원관리에서 수정 시에도 동일 테이블 사용)
 */
import type { ProfileRow, ProfileUpdatePayload } from "./types";
import { patchSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { dispatchProfileUpdated } from "./profile-update-events";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";

export type UpdateMyProfileResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

function syncCachesAfterProfileSave(payload: ProfileUpdatePayload): void {
  const cur = getCurrentUser();
  if (!cur) return;
  const patch: { nickname?: string; avatar_url?: string | null } = {};
  if (payload.nickname !== undefined) {
    patch.nickname = (payload.nickname ?? cur.nickname)?.trim() || cur.nickname;
  }
  if (payload.avatar_url !== undefined) {
    patch.avatar_url = payload.avatar_url;
  }
  if (Object.keys(patch).length > 0) {
    patchSupabaseProfileCache(patch);
  }
  dispatchProfileUpdated();
}

export async function updateMyProfile(
  payload: ProfileUpdatePayload
): Promise<UpdateMyProfileResult> {
  const userId = getCurrentUser()?.id;
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  /** 브라우저에서 직접 profiles.update 는 아이디 로그인(무 JWT)일 때 RLS 로 항상 실패함 — API + 서비스롤(또는 동일 JWT)로만 저장 */
  const hasSupabaseProject = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  if (typeof window !== "undefined" && hasSupabaseProject) {
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; warning?: string }
        | null;
      if (res.ok && data?.ok) {
        invalidateMeProfileDedupedCache();
        syncCachesAfterProfileSave(payload);
        const w = typeof data.warning === "string" && data.warning.trim() ? data.warning.trim() : undefined;
        return w ? { ok: true, warning: w } : { ok: true };
      }
      return {
        ok: false,
        error: data?.error?.trim() || `저장에 실패했습니다. (${res.status})`,
      };
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
    invalidateMeProfileDedupedCache();
    syncCachesAfterProfileSave(payload);
    return { ok: true };
  } catch {
    return { ok: false, error: "저장에 실패했습니다." };
  }
}
