"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { invalidateFavoriteCountClientCache } from "@/lib/favorites/getMyFavoriteCount";
import { dispatchPostFavoriteChanged } from "@/lib/favorites/post-favorite-events";

export type ToggleFavoriteResult =
  | { ok: true; isFavorite: boolean }
  | { ok: false; error: string };

/**
 * 찜 토글 — API 라우트 사용 (테스트 로그인·Supabase RLS 401 회피)
 */
export async function toggleFavorite(postId: string): Promise<ToggleFavoriteResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  try {
    const res = await fetch("/api/favorites/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ postId }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error:
          (data as { error?: string }).error ??
          (res.status === 401 ? "로그인이 필요합니다." : "처리에 실패했습니다."),
      };
    }
    if ((data as { ok?: boolean }).ok === true && typeof (data as { isFavorite?: boolean }).isFavorite === "boolean") {
      invalidateFavoriteCountClientCache();
      const isFavorite = (data as { isFavorite: boolean }).isFavorite;
      dispatchPostFavoriteChanged({ postId, isFavorite });
      return { ok: true, isFavorite };
    }
    return { ok: false, error: "응답 형식 오류" };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "네트워크 오류" };
  }
}
