"use client";

/**
 * 카테고리 순서 변경 (orderedIds 순서대로 sort_order 0,1,2,... 부여)
 * RLS: 관리자만 update 가능
 */
import { getSupabaseClient } from "@/lib/supabase/client";

export type ReorderCategoriesResult = { ok: true } | { ok: false; error: string };

export async function reorderCategories(orderedIds: string[]): Promise<ReorderCategoriesResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase를 사용할 수 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정한 뒤 개발 서버를 재시작해 주세요." };
  }

  try {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await (supabase as any)
        .from("categories")
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq("id", orderedIds[i]);
      if (error) return { ok: false, error: (error as { message?: string }).message ?? "순서 변경에 실패했습니다." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "순서 변경에 실패했습니다." };
  }
}
