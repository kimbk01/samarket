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
import { CATEGORY_WITH_SETTINGS_SELECT } from "./category-select-fragment";
import { fetchTradeCategoryDescendantNodes } from "@/lib/market/trade-category-subtree";

const CHILDREN_BY_PARENT_TTL_MS = 45_000;
const CHILDREN_FEED_FILTER_BY_PARENT_TTL_MS = 45_000;

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

async function fetchActiveChildrenRows(parentId: string): Promise<CategoryDbRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !parentId?.trim()) return [];
  try {
    const { data, error } = await (supabase as any)
      .from("categories")
      .select(CATEGORY_WITH_SETTINGS_SELECT)
      .eq("parent_id", parentId.trim())
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error || !Array.isArray(data)) return [];
    return data as CategoryDbRow[];
  } catch {
    return [];
  }
}

export async function getChildCategories(parentId: string): Promise<CategoryWithSettings[]> {
  const key = `children:${parentId.trim()}`;
  return cachedCategoryFetch(key, CHILDREN_BY_PARENT_TTL_MS, async () => {
    const rows = await fetchActiveChildrenRows(parentId);
    // Row-2 topic chips: omit primary-menu categories (show_in_home_chips=true) if wrongly linked as children.
    return rows.filter((row) => row.show_in_home_chips !== true).map(mapChildCategoryRow);
  });
}

/**
 * 마켓 피드 trade_category_id 필터용 — 루트 아래 **모든 깊이** 활성 trade 카테고리 id (칩용 필터와 무관).
 */
export async function getChildCategoriesForFeedFilter(
  parentId: string
): Promise<{ id: string; slug: string | null }[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !parentId?.trim()) return [];
  const key = `children-feed-filter:${parentId.trim()}`;
  return cachedCategoryFetch(key, CHILDREN_FEED_FILTER_BY_PARENT_TTL_MS, async () =>
    fetchTradeCategoryDescendantNodes(supabase, parentId)
  );
}
