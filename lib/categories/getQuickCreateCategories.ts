"use client";

/**
 * Quick Create 런처용 카테고리 목록
 * - quick_create_enabled=true, is_active=true
 * - 정렬: quick_create_group, quick_create_order asc
 */
import type { CategoryWithSettings } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { selectCategoriesWithSettings } from "./query-categories-select";
import { toCategoryWithSettings, type CategoryDbRow } from "./to-category-with-settings";

export async function getQuickCreateCategories(): Promise<CategoryWithSettings[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await selectCategoriesWithSettings(supabase as never, (cols) =>
      (supabase as any)
        .from("categories")
        .select(cols)
        .eq("is_active", true)
        .eq("quick_create_enabled", true)
        .is("parent_id", null)
        .order("quick_create_group", { ascending: true, nullsFirst: false })
        .order("quick_create_order", { ascending: true })
    );

    if (error || !Array.isArray(data)) return [];
    return (data as CategoryDbRow[]).map(toCategoryWithSettings);
  } catch {
    return [];
  }
}
