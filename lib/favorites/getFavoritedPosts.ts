"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { PostWithMeta } from "@/lib/posts/schema";

export interface FavoritedPost extends PostWithMeta {
  favorited_at: string;
}

/**
 * 현재 로그인 사용자가 찜한 게시글 목록 (찜한 순)
 * — `/api/favorites/list` 사용 (개발 테스트 쿠키·토글·개수 API와 동일 사용자 기준)
 */
export async function getFavoritedPosts(): Promise<FavoritedPost[]> {
  const user = getCurrentUser();
  if (!user?.id) return [];

  try {
    const res = await fetch("/api/favorites/list");
    const d = (await res.json().catch(() => ({}))) as { items?: unknown };
    if (!res.ok || !Array.isArray(d.items)) return [];
    return d.items as FavoritedPost[];
  } catch {
    return [];
  }
}
