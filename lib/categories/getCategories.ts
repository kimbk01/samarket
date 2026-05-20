"use client";

/**
 * 카테고리 목록 조회 (Supabase categories + category_settings)
 * - sort_order 순, is_active 필터 가능
 * - mock 미의존, Supabase 없으면 빈 배열
 */
import type { CategoryWithSettings } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { writeCategoryCache } from "./category-memory-cache";
import { CATEGORY_WITH_SETTINGS_SELECT } from "./category-select-fragment";
import { toCategoryWithSettings, type CategoryDbRow } from "./to-category-with-settings";
import { normalizeMarketSlugParam } from "./tradeMarketPath";

/** `getCategoryBySlugOrId` 와 동일 키 규칙으로 채워, 목록 직후 단건 조회 네트워크를 피함 */
function primeCategoryByKeyMemoryCache(list: CategoryWithSettings[]): void {
  for (const c of list) {
    const idRaw = c.id.trim();
    if (idRaw) {
      writeCategoryCache(`cat:${normalizeMarketSlugParam(idRaw)}:${idRaw}`, c);
    }
    const slugRaw = c.slug?.trim();
    if (slugRaw) {
      writeCategoryCache(`cat:${normalizeMarketSlugParam(slugRaw)}:${slugRaw}`, c);
    }
  }
}

export async function getCategories(filters?: {
  type?: "trade" | "service" | "community" | "feature";
  activeOnly?: boolean;
}): Promise<CategoryWithSettings[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const activeOnly = filters?.activeOnly !== false;

  try {
     
    const q = (supabase as any)
      .from("categories")
      .select(CATEGORY_WITH_SETTINGS_SELECT);
    const applied = activeOnly ? q.eq("is_active", true) : q;
    const { data, error } = await applied.order("sort_order", { ascending: true });

    if (error || !Array.isArray(data)) return [];
    let list = (data as CategoryDbRow[]).map(toCategoryWithSettings);
    if (filters?.type) list = list.filter((c) => c.type === filters.type);
    primeCategoryByKeyMemoryCache(list);
    return list;
  } catch {
    return [];
  }
}
