"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export type CreateCommentResult = { ok: true; id: string } | { ok: false; error: string };

export async function createComment(
  postId: string,
  content: string
): Promise<CreateCommentResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  const text = content?.trim();
  if (!text) return { ok: false, error: "댓글 내용을 입력해 주세요." };

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "기능을 사용할 수 없습니다." };

  try {
    const { data, error } = await (supabase as any)
      .from("comments")
      .insert({
        post_id: postId,
        user_id: user.id,
        content: text,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message ?? "등록에 실패했습니다." };
    return { ok: true, id: data?.id ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "등록에 실패했습니다." };
  }
}
