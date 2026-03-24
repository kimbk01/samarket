"use client";

/**
 * 카테고리 삭제
 * - 하위에 게시물이 있으면 삭제 불가, 변경(수정) 유도
 * - 게시물이 없을 때만 삭제 수행 (category_settings는 CASCADE로 자동 삭제)
 */
import { getSupabaseClient } from "@/lib/supabase/client";
import { getPostCountByCategory } from "@/lib/posts/getPostCountByCategory";

export type DeleteCategoryResult = { ok: true } | { ok: false; error: string };

export async function deleteCategory(id: string): Promise<DeleteCategoryResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase를 사용할 수 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정한 뒤 개발 서버를 재시작해 주세요." };
  }

  try {
    const postCount = await getPostCountByCategory(id);
    if (postCount > 0) {
      return {
        ok: false,
        error: `${postCount}개의 게시물이 있어 삭제할 수 없습니다. 수정(변경)을 이용하시거나, 게시물을 다른 카테고리로 옮긴 뒤 삭제해 주세요.`,
      };
    }

    const { error } = await (supabase as any).from("categories").delete().eq("id", id);
    if (error) return { ok: false, error: (error as { message?: string }).message ?? "삭제에 실패했습니다." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "삭제에 실패했습니다." };
  }
}
