"use client";

import type { PostWithMeta } from "./schema";

export type GetSimilarPostsOptions = {
  /** 현재 글 판매자 UUID — 가능하면 같은 판매자 글을 제외(다른 판매자 위주) */
  excludeAuthorUserId?: string | null;
};

/**
 * 같은 카테고리 유사 물품 — **서버 API** (`/api/posts/.../similar`)로 조회.
 * 브라우저 Supabase(RLS)만 쓰면 홈·상세와 노출이 어긋나거나 빈 목록이 될 수 있음 (`getPostById` 와 동일 이유).
 */
export async function getSimilarPosts(
  excludePostId: string,
  categoryId: string,
  limit = 6,
  options?: GetSimilarPostsOptions
): Promise<PostWithMeta[]> {
  if (typeof window === "undefined") return [];

  const cid = categoryId?.trim();
  if (!cid) return [];

  const pid = excludePostId?.trim();
  if (!pid) return [];

  const excludeSeller = options?.excludeAuthorUserId?.trim() ?? "";

  try {
    const qs = new URLSearchParams({
      categoryId: cid,
      limit: String(Math.min(24, Math.max(1, limit))),
    });
    if (excludeSeller) qs.set("excludeSeller", excludeSeller);

    const res = await fetch(`/api/posts/${encodeURIComponent(pid)}/similar?${qs}`, {
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
