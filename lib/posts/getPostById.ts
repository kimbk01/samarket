"use client";

import type { PostWithMeta } from "./schema";

export { normalizePostImages, normalizePostMeta, normalizePostPrice } from "./post-normalize";

export type PostDetailClientBundle = {
  post: PostWithMeta;
};

/**
 * 거래 글 상세 — 서버 API (`/api/posts/.../detail`)로 조회.
 */
export async function getPostById(postId: string): Promise<PostDetailClientBundle | null> {
  const id = postId?.trim();
  if (!id || typeof window === "undefined") return null;

  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(id)}/detail`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    if (!raw || typeof raw !== "object") return null;

    const o = raw as Record<string, unknown>;
    if (typeof o.post === "object" && o.post != null && typeof (o.post as PostWithMeta).id === "string") {
      return { post: o.post as PostWithMeta };
    }
    if (typeof o.id === "string") {
      return { post: o as unknown as PostWithMeta };
    }

    return null;
  } catch {
    return null;
  }
}
