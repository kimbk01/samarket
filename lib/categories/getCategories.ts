"use client";

/**
 * 카테고리 목록 조회 (Supabase categories + category_settings)
 * - sort_order 순, is_active 필터 가능
 * - mock 미의존, Supabase 없으면 빈 배열
 */
import type { CategoryWithSettings } from "./types";
import { parseQuickCreateGroup } from "./parseQuickCreateGroup";
import type { CategorySettingsRaw } from "./normalizeCategorySettings";
import { normalizeCategorySettings } from "./normalizeCategorySettings";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CATEGORY_WITH_SETTINGS_SELECT } from "./category-select-fragment";

/** Supabase 조인 결과 행 */
interface CategoryDbRow {
  id: string;
  name: string;
  slug: string;
  icon_key: string;
  type: string;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  quick_create_enabled?: boolean;
  quick_create_group?: string | null;
  quick_create_order?: number;
  show_in_home_chips?: boolean;
  parent_id?: string | null;
  category_settings?: CategorySettingsRaw;
}

function toCategoryWithSettings(row: CategoryDbRow): CategoryWithSettings {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon_key: row.icon_key,
    type: row.type as CategoryWithSettings["type"],
    parent_id: row.parent_id ?? null,
    sort_order: row.sort_order,
    is_active: row.is_active,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
    quick_create_enabled: row.quick_create_enabled ?? false,
    quick_create_group: parseQuickCreateGroup(row.quick_create_group),
    quick_create_order: row.quick_create_order ?? 0,
    show_in_home_chips: row.show_in_home_chips ?? true,
    settings: normalizeCategorySettings(row.category_settings),
  };
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
    return list;
  } catch {
    return [];
  }
}
