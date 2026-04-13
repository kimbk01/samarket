"use client";

import type { PostWithMeta } from "./schema";

/**
 * 작성자별 게시글 목록 — **서버 API** (`/api/posts/by-author`)로 조회.
 * 브라우저 Supabase(RLS)만 쓰면 상세 하단 「판매자의 다른 물품」이 비는 경우가 있음.
 */
export async function getPostsByAuthor(authorId: string): Promise<PostWithMeta[]> {
  if (typeof window === "undefined") return [];

  const id = authorId?.trim();
  if (!id) return [];

  try {
    const res = await fetch(`/api/posts/by-author?${new URLSearchParams({ userId: id })}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { ok?: boolean; posts?: PostWithMeta[] };
    return Array.isArray(data.posts) ? data.posts : [];
  } catch {
    return [];
  }
}
