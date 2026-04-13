"use client";

/**
 * 거래 메뉴(홈 1행) 하위 주제 카테고리 — 홈/마켓 2행 칩용
 */
import type { CategoryWithSettings } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  mapChildCategoryRow,
  type CategoryDbRow,
} from "./to-category-with-settings";
import { cachedCategoryFetch } from "./category-memory-cache";
import { CATEGORY_WITH_SETTINGS_SELECT } from "./category-select-fragment";
import { fetchTradeCategoryDescendantNodes } from "@/lib/market/trade-category-subtree";

const CHILDREN_BY_PARENT_TTL_MS = 45_000;
const CHILDREN_FEED_FILTER_BY_PARENT_TTL_MS = 45_000;

export type { CategoryDbRow };
export { mapChildCategoryRow };

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
