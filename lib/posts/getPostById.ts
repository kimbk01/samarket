"use client";

import type { PostWithMeta } from "./schema";

export { normalizePostImages, normalizePostMeta, normalizePostPrice } from "./post-normalize";

/**
 * 거래 글 상세 — 브라우저 Supabase(RLS) 대신 서버 API로 조회해 목록과 동일하게 노출.
 */
export async function getPostById(postId: string): Promise<PostWithMeta | null> {
  const id = postId?.trim();
  if (!id || typeof window === "undefined") return null;

  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(id)}/detail`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PostWithMeta | null;
    if (!data || typeof data !== "object" || typeof (data as PostWithMeta).id !== "string") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
