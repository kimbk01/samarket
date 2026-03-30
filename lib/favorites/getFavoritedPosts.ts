"use client";

import type { PostWithMeta } from "@/lib/posts/schema";

export interface FavoritedPost extends PostWithMeta {
  favorited_at: string;
}

export type GetFavoritedPostsResult = {
  items: FavoritedPost[];
  /** 서버 세션(쿠키). 클라 `getCurrentUser()`와 달라도 목록은 이 값을 기준으로 표시 */
  authenticated: boolean;
};

/**
 * 찜한 게시글 목록 — 항상 `/api/favorites/list` 호출 (세션은 쿠키로만 판별).
 * 예전: `getCurrentUser()` 없으면 fetch 생략 → 로그인 상태인데도 빈 목록이 되는 버그가 있었음.
 */
export async function getFavoritedPosts(): Promise<GetFavoritedPostsResult> {
  try {
    const res = await fetch("/api/favorites/list", {
      credentials: "include",
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as {
      items?: unknown;
      authenticated?: unknown;
    };
    const items = Array.isArray(d.items) ? (d.items as FavoritedPost[]) : [];
    if (!res.ok) {
      return { items: [], authenticated: false };
    }
    /** 서버가 `authenticated`를 내려줄 때만 신뢰(구 API는 필드 없음 → 비로그인으로 처리) */
    const authenticated = d.authenticated === true;
    return { items, authenticated };
  } catch {
    return { items: [], authenticated: false };
  }
}
