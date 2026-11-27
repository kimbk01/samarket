"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * slug 중복 검사 (생성 시: 존재하면 불가, 수정 시: 자기 자신 제외하고 존재하면 불가)
 */
export async function checkSlugAvailable(
  slug: string,
  excludeCategoryId?: string
): Promise<{ available: true } | { available: false; error: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { available: true };

  const s = slug?.trim();
  if (!s) return { available: false, error: "slug_required" };

  try {
    const q = (supabase as any).from("categories").select("id").eq("slug", s).limit(1);
    const { data, error } = await q.maybeSingle();

    if (error) {
      console.error("[checkSlugAvailable]", error?.message || String(error));
      return { available: false, error: "slug_check_failed" };
    }
    if (!data) return { available: true };
    if (excludeCategoryId && data.id === excludeCategoryId) return { available: true };
    return { available: false, error: "slug_taken" };
  } catch (e) {
    console.error("[checkSlugAvailable]", e instanceof Error ? e.message : String(e));
    return { available: false, error: "slug_check_failed" };
  }
}
