"use client";

import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PostStatus } from "@/lib/posts/schema";

export type AdminUpdateResult = { ok: true } | { ok: false; error: string };

/** DB posts.status 허용값 (draft|active|reserved|sold|hidden|deleted) */
export type PostStatusForUpdate = PostStatus | "deleted";

/**
 * 관리자: 게시글/상품 상태 변경(숨김/삭제/판매완료 등)
 */
export async function updatePostStatusAdmin(
  postId: string,
  status: PostStatus | PostStatusForUpdate
): Promise<AdminUpdateResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "DB를 사용할 수 없습니다." };

  try {
    const nextVisibility =
      status === "hidden" || status === "deleted" ? "hidden" : "public";

    const { error } = await (supabase as any)
      .from(POSTS_TABLE_WRITE)
      .update({
        status,
        visibility: nextVisibility,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);

    if (error) return { ok: false, error: error.message ?? "변경에 실패했습니다." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "변경에 실패했습니다." };
  }
}

/** 관리자: 끌올 — posts.updated_at 갱신 (목록 정렬 반영) */
export async function updatePostBumpAdmin(postId: string): Promise<AdminUpdateResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "DB를 사용할 수 없습니다." };
  try {
    const { error } = await (supabase as any)
      .from(POSTS_TABLE_WRITE)
      .update({ updated_at: new Date().toISOString() })
      .eq("id", postId);
    if (error) return { ok: false, error: error.message ?? "끌올에 실패했습니다." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "끌올에 실패했습니다." };
  }
}
