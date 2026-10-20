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
import { invalidatePhilifeFeedCachesForMemberIdentityChange } from "@/lib/community/philife-feed-session-cache";
import { invalidateNeighborhoodFeedClientShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { mergeAppBootProfileFull, peekAppBootProfile } from "@/lib/app-boot/app-boot-store";
import type { ProfilePatchExpected } from "./profile-patch-concurrency";

/** PATCH 응답의 저장 결과 (서버가 UPDATE ... RETURNING 한 값) */
export type SavedProfileFields = Pick<ProfileRow, "id" | "nickname" | "display_name" | "bio" | "avatar_url" | "updated_at">;

export type UpdateMyProfileResult =
  | { ok: true; warning?: string; saved?: SavedProfileFields }
  | { ok: false; error: string; code?: string };

/**
 * 저장 성공 직후 앱 boot 스냅샷 갱신 — `/mypage` 는 boot 스냅샷을 읽으므로 이것을 갱신하지 않으면
 * 화면이 저장 전 값으로 되돌아간다(감사 #2·#3).
 */
function syncAppBootSnapshotAfterSave(saved: SavedProfileFields | undefined): void {
  if (!saved?.id) return;
  const boot = peekAppBootProfile();
  if (!boot?.id || boot.id !== saved.id) return;
  mergeAppBootProfileFull({
    ...boot,
    nickname: saved.nickname,
    display_name: saved.display_name,
    bio: saved.bio,
    avatar_url: saved.avatar_url,
    updated_at: saved.updated_at,
  });
}

/** 서버·게이트가 내부 코드(`account_state_unavailable` 등)만 줄 때 사용자에게 코드 노출 금지 */
function toUserFacingSaveError(raw: string | undefined, status: number): string {
  const msg = raw?.trim() ?? "";
  if (msg && !/^[a-z0-9_.:-]+$/i.test(msg)) return msg;
  if (status === 401) return "로그인이 필요합니다. 다시 로그인해 주세요.";
  return "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function syncCachesAfterProfileSave(payload: ProfileUpdatePayload): void {
  const cur = getCurrentUser();
  if (!cur) return;
  const patch: { nickname?: string; display_name?: string | null; avatar_url?: string | null } = {};
  const identityTouched =
    payload.display_name !== undefined || payload.nickname !== undefined;
  if (payload.display_name !== undefined) {
    const next = (payload.display_name ?? cur.display_name ?? cur.nickname)?.trim() || cur.nickname;
    patch.display_name = next;
    patch.nickname = next;
  } else if (payload.nickname !== undefined) {
    const next = (payload.nickname ?? cur.display_name ?? cur.nickname)?.trim() || cur.nickname;
    patch.display_name = next;
    patch.nickname = next;
  }
  if (payload.avatar_url !== undefined) {
    patch.avatar_url = payload.avatar_url;
  }
  if (Object.keys(patch).length > 0) {
    patchSupabaseProfileCache(patch);
  }
  if (identityTouched) {
    invalidatePhilifeFeedCachesForMemberIdentityChange();
    invalidateNeighborhoodFeedClientShortTtl();
  }
  dispatchProfileUpdated();
}

export async function updateMyProfile(
  payload: ProfileUpdatePayload,
  options?: {
    /** 편집 화면을 열 때 읽은 원본 값 — 서버가 그 사이 변경을 감지하면 409 profile_conflict */
    expected?: ProfilePatchExpected;
  }
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
        body: JSON.stringify(options?.expected ? { ...payload, expected: options.expected } : payload),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; code?: string; warning?: string; profile?: SavedProfileFields }
        | null;
      if (res.ok && data?.ok) {
        invalidateMeProfileDedupedCache();
        syncAppBootSnapshotAfterSave(data.profile);
        syncCachesAfterProfileSave(payload);
        const w = typeof data.warning === "string" && data.warning.trim() ? data.warning.trim() : undefined;
        return { ok: true, ...(w ? { warning: w } : {}), ...(data.profile ? { saved: data.profile } : {}) };
      }
      return {
        ok: false,
        error: toUserFacingSaveError(data?.error, res.status),
        ...(data?.code ? { code: data.code } : {}),
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
