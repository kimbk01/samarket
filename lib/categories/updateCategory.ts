"use client";

/**
 * 카테고리 단건 수정 (Supabase categories)
 * - RLS: 관리자만 update 가능
 */
import type { CategoryUpdatePayload } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";

export type UpdateCategoryResult = { ok: true } | { ok: false; error: string };

export async function updateCategory(
  id: string,
  payload: CategoryUpdatePayload
): Promise<UpdateCategoryResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      error: "Supabase를 사용할 수 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정한 뒤 개발 서버를 재시작해 주세요.",
    };
  }

  try {
     
    const { error } = await (supabase as any)
      .from("categories")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { ok: false, error: (error as { message?: string }).message ?? "수정에 실패했습니다." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "수정에 실패했습니다." };
  }
}
