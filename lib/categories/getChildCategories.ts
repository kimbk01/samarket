"use client";

/**
 * 거래 메뉴(홈 1행) 하위 주제 카테고리 — 홈/마켓 2행 칩용
 */
import type { CategoryWithSettings } from "./types";
import { parseQuickCreateGroup } from "./parseQuickCreateGroup";
import type { CategorySettingsRaw } from "./normalizeCategorySettings";
import { normalizeCategorySettings } from "./normalizeCategorySettings";
import { getSupabaseClient } from "@/lib/supabase/client";
import { cachedCategoryFetch } from "./category-memory-cache";

const CHILDREN_BY_PARENT_TTL_MS = 45_000;

export interface CategoryDbRow {
  id: string;
  name: string;
  slug: string;
  icon_key: string;
  type: string;
  parent_id?: string | null;
  sort_order: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  quick_create_enabled?: boolean;
  quick_create_group?: string | null;
  quick_create_order?: number;
  show_in_home_chips?: boolean;
  category_settings?: CategorySettingsRaw;
}

export function mapChildCategoryRow(row: CategoryDbRow): CategoryWithSettings {
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

export async function getChildCategories(parentId: string): Promise<CategoryWithSettings[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !parentId?.trim()) return [];

  const key = `children:${parentId.trim()}`;
  return cachedCategoryFetch(key, CHILDREN_BY_PARENT_TTL_MS, async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("categories")
        .select(
          "*, category_settings(can_write, has_price, has_chat, has_location, has_direct_deal, has_free_share, post_type)"
        )
        .eq("parent_id", parentId.trim())
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error || !Array.isArray(data)) return [];
      return (data as CategoryDbRow[]).map(mapChildCategoryRow);
    } catch {
      return [];
    }
  });
}
