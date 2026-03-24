"use client";

/**
 * 관리자용 카테고리 전체 목록 (비활성 포함, sort_order → created_at 순)
 * Supabase categories + category_settings 조인
 */
import type { CategoryWithSettings } from "@/lib/categories/types";
import { parseQuickCreateGroup } from "@/lib/categories/parseQuickCreateGroup";
import type { CategorySettingsRaw } from "@/lib/categories/normalizeCategorySettings";
import { normalizeCategorySettings } from "@/lib/categories/normalizeCategorySettings";
import { getSupabaseClient } from "@/lib/supabase/client";

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

function mapRow(row: CategoryDbRow): CategoryWithSettings {
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

export async function getAdminCategories(): Promise<CategoryWithSettings[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("categories")
      .select("*, category_settings(can_write, has_price, has_chat, has_location, has_direct_deal, has_free_share, post_type)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error || !Array.isArray(data)) return [];
    return (data as CategoryDbRow[]).map(mapRow);
  } catch {
    return [];
  }
}
