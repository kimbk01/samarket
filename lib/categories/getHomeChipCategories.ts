"use client";

/**
 * 홈 상단 카테고리 칩용 목록
 * - 실제 조회는 [`fetchTradeHomeRootCategories`](@/lib/categories/trade-home-root-query) 와 동일 (어드민 메뉴와 1:1)
 * - `show_in_home_chips=false` 인 카테고리는 칩에 안 보이고 Quick Create(런처)에만 노출 가능
 */
import { getSupabaseClient } from "@/lib/supabase/client";
import type { CategoryWithSettings } from "./types";
import { getActiveCategories } from "./getActiveCategories";
import { cachedCategoryFetch } from "./category-memory-cache";
import { queryTradeHomeRootCategories } from "./trade-home-root-query";

const HOME_CHIP_TRADE_TTL_MS = 45_000;

export async function getHomeChipCategories(): Promise<CategoryWithSettings[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  return cachedCategoryFetch("homeChips:trade:v1", HOME_CHIP_TRADE_TTL_MS, async () => {
    const r = await queryTradeHomeRootCategories(supabase as any);
    if (r.ok) return r.categories;
    const fallback = await getActiveCategories({ type: "trade" });
    return fallback.filter((c) => c.show_in_home_chips !== false && !c.parent_id);
  });
}
