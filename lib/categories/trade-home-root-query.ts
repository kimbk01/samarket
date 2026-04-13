/**
 * 홈 거래 상단 탭(칩) = `/admin/menus/trade` 에서 `show_in_home_chips` 로 노출되는 **거래 루트** 목록.
 * 클라이언트·서버·`lib/trade/trade-market-catalog` 가 동일 SELECT/조건을 쓴다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryWithSettings } from "./types";
import { parseQuickCreateGroup } from "./parseQuickCreateGroup";
import { CATEGORY_WITH_SETTINGS_SELECT } from "./category-select-fragment";

interface TradeHomeRootDbRow {
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
  category_settings?: unknown;
}

function mapTradeHomeRootRow(row: TradeHomeRootDbRow): CategoryWithSettings {
  const raw = Array.isArray(row.category_settings)
    ? (row.category_settings[0] as {
        can_write: boolean;
        has_price: boolean;
        has_chat: boolean;
        has_location: boolean;
        has_direct_deal?: boolean;
        has_free_share?: boolean;
        post_type: string;
      } | null)
    : null;
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

export type TradeHomeRootQueryResult =
  | { ok: true; categories: CategoryWithSettings[] }
  | { ok: false };

/**
 * 동일 SELECT — 성공 여부를 구분(빈 목록은 `ok: true`, 쿼리 실패는 `ok: false`).
 * 홈 칩은 `ok: false` 일 때만 레거시 폴백한다.
 */
export async function queryTradeHomeRootCategories(
  supabase: SupabaseClient<any>
): Promise<TradeHomeRootQueryResult> {
  try {
    const { data, error } = await supabase
      .from("categories")
      .select(CATEGORY_WITH_SETTINGS_SELECT)
      .eq("is_active", true)
      .eq("type", "trade")
      .eq("show_in_home_chips", true)
      .is("parent_id", null)
      .order("sort_order", { ascending: true });

    if (error || !Array.isArray(data)) return { ok: false };
    return { ok: true, categories: (data as TradeHomeRootDbRow[]).map(mapTradeHomeRootRow) };
  } catch {
    return { ok: false };
  }
}

/**
 * `categories` — 거래 홈 상단 메뉴용 루트만. 쿼리 실패 시 `[]`(합집합·expand 측은 필터 생략).
 */
export async function fetchTradeHomeRootCategories(
  supabase: SupabaseClient<any>
): Promise<CategoryWithSettings[]> {
  const r = await queryTradeHomeRootCategories(supabase);
  return r.ok ? r.categories : [];
}
