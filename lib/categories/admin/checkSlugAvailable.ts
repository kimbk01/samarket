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
  if (!s) return { available: false, error: "slug를 입력해 주세요." };

  try {
    const q = (supabase as any).from("categories").select("id").eq("slug", s).limit(1);
    const { data, error } = await q.maybeSingle();

    if (error) {
      const msg = error?.message || String(error);
      return { available: false, error: msg.includes("does not exist") ? "categories 테이블이 없습니다. Supabase에서 마이그레이션을 실행해 주세요." : msg };
    }
    if (!data) return { available: true };
    if (excludeCategoryId && data.id === excludeCategoryId) return { available: true };
    return { available: false, error: "이미 사용 중인 slug입니다." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { available: false, error: msg || "확인에 실패했습니다." };
  }
}
