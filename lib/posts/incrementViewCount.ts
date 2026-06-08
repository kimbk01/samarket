"use client";

/**
 * 상세 조회 시 조회수 증가 (비동기, 실패해도 무시)
 * - `POST /api/posts/[postId]/increment-view` (service_role UPDATE)
 */
export async function incrementPostViewCount(postId: string): Promise<void> {
  const id = postId?.trim();
  if (!id || typeof window === "undefined") return;

  try {
    await fetch(`/api/posts/${encodeURIComponent(id)}/increment-view`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // ignore
  }
}
