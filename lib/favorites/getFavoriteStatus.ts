"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";

/**
 * 현재 사용자의 해당 게시글 찜 여부 — API 라우트 사용 (RLS 401 회피)
 */
export async function getFavoriteStatus(postId: string): Promise<boolean> {
  const user = getCurrentUser();
  if (!user?.id || !postId?.trim()) return false;

  try {
    const params = new URLSearchParams({
      postIds: postId.trim(),
    });
    const res = await fetch(`/api/favorites/status?${params}`);
    const data = (await res.json().catch(() => ({}))) as Record<string, boolean>;
    return data[postId.trim()] === true;
  } catch {
    return false;
  }
}
