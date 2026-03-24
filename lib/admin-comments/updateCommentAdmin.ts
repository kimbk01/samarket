"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export type AdminUpdateResult = { ok: true } | { ok: false; error: string };

/**
 * 관리자: 댓글 숨김 처리 (hidden 컬럼이 있는 경우)
 * TODO: comments 테이블에 hidden 컬럼 추가 시 .update({ hidden: true }) 사용
 */
export async function hideCommentAdmin(commentId: string): Promise<AdminUpdateResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "DB를 사용할 수 없습니다." };

  try {
    const { error } = await (supabase as any)
      .from("comments")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", commentId);

    if (error) return { ok: false, error: error.message ?? "변경에 실패했습니다." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "변경에 실패했습니다." };
  }
}

/**
 * 관리자: 댓글 삭제
 */
export async function deleteCommentAdmin(commentId: string): Promise<AdminUpdateResult> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "DB를 사용할 수 없습니다." };

  try {
    const { error } = await (supabase as any).from("comments").delete().eq("id", commentId);

    if (error) return { ok: false, error: error.message ?? "삭제에 실패했습니다." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "삭제에 실패했습니다." };
  }
}
