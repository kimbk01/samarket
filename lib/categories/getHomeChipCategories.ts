"use client";

/**
 * 홈 상단 카테고리 칩용 목록
 * - is_active=true, type=trade, show_in_home_chips=true 인 것만
 * - show_in_home_chips=false 인 카테고리는 칩에 안 보이고 Quick Create(런처)에만 노출 가능
 */
import { getSupabaseClient } from "@/lib/supabase/client";
import { getActiveCategories } from "./getActiveCategories";
import type { CategoryWithSettings } from "./types";
import { parseQuickCreateGroup } from "./parseQuickCreateGroup";

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
  category_settings?: Array<{
    can_write: boolean;
    has_price: boolean;
    has_chat: boolean;
    has_location: boolean;
    has_direct_deal?: boolean;
    has_free_share?: boolean;
    post_type: string;
  }> | null;
}

function toCategoryWithSettings(row: CategoryDbRow): CategoryWithSettings {
  const raw = Array.isArray(row.category_settings) ? row.category_settings[0] : null;
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
    settings: raw
      ? {
          can_write: raw.can_write,
          has_price: raw.has_price,
          has_chat: raw.has_chat,
          has_location: raw.has_location,
          has_direct_deal: raw.has_direct_deal ?? true,
          has_free_share: raw.has_free_share ?? true,
          post_type: raw.post_type,
        }
      : null,
  };
}

export async function getHomeChipCategories(): Promise<CategoryWithSettings[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await (supabase as any)
      .from("categories")
      .select("*, category_settings(can_write, has_price, has_chat, has_location, has_direct_deal, has_free_share, post_type)")
      .eq("is_active", true)
      .eq("type", "trade")
      .eq("show_in_home_chips", true)
      .is("parent_id", null)
      .order("sort_order", { ascending: true });

    if (error || !Array.isArray(data)) {
      const fallback = await getActiveCategories({ type: "trade" });
      return fallback.filter((c) => c.show_in_home_chips !== false && !c.parent_id);
    }
    return (data as CategoryDbRow[]).map(toCategoryWithSettings);
  } catch {
    const fallback = await getActiveCategories({ type: "trade" });
    return fallback.filter((c) => c.show_in_home_chips !== false && !c.parent_id);
  }
}
