"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { PostStatus } from "./schema";

export type UpdateStatusResult = { ok: true } | { ok: false; error: string };

export async function updatePostStatus(
  postId: string,
  status: PostStatus
): Promise<UpdateStatusResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "저장 기능을 사용할 수 없습니다." };

  try {
    const payload = { status, updated_at: new Date().toISOString() };
    const res = await (supabase as any).from("posts").update(payload).eq("id", postId).eq("user_id", user.id).select("id");
    if (res.error) return { ok: false, error: (res.error as { message?: string }).message ?? "변경에 실패했습니다." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "변경에 실패했습니다." };
  }
}
