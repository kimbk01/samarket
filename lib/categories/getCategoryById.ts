"use client";

/**
 * 카테고리 단건 조회 (id 또는 slug로 조회)
 * 목록 페이지 상단 메타/타입 검증용
 */
import type { CategoryWithSettings } from "./types";
import { parseQuickCreateGroup } from "./parseQuickCreateGroup";
import type { CategorySettingsRaw } from "./normalizeCategorySettings";
import { normalizeCategorySettings } from "./normalizeCategorySettings";
import { getSupabaseClient } from "@/lib/supabase/client";
import { normalizeMarketSlugParam } from "./tradeMarketPath";
import { readCategoryCache, writeCategoryCache } from "./category-memory-cache";

const CATEGORY_BY_KEY_TTL_MS = 60_000;

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

export function toCategoryWithSettings(row: CategoryDbRow): CategoryWithSettings {
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

/**
 * id 또는 slug로 카테고리 조회 (categories + category_settings)
 * 없으면 null
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getCategoryBySlugOrId(
  identifier: string
): Promise<CategoryWithSettings | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !identifier?.trim()) return null;

  const rawTrim = identifier.trim();
  const id = normalizeMarketSlugParam(identifier);
  if (!id) return null;

  const cacheKey = `cat:${id}:${rawTrim}`;
  const hit = readCategoryCache<CategoryWithSettings>(cacheKey, CATEGORY_BY_KEY_TTL_MS);
  if (hit) return hit;
  const row = await getCategoryBySlugOrIdUncached(supabase, rawTrim, id);
  if (row) writeCategoryCache(cacheKey, row);
  return row;
}

async function getCategoryBySlugOrIdUncached(
  supabase: ReturnType<typeof getSupabaseClient>,
  rawTrim: string,
  id: string
): Promise<CategoryWithSettings | null> {
  try {
    const baseQuery = () =>
      (supabase as any)
        .from("categories")
        .select("*, category_settings(can_write, has_price, has_chat, has_location, has_direct_deal, has_free_share, post_type)");

    // slug와 id를 따로 조회 (.or() 문자열 이스케이프 이슈 방지)
    let data: CategoryDbRow | null = null;
    let error: unknown = null;

    if (UUID_REGEX.test(id)) {
      const res = await baseQuery().eq("id", id).limit(1).maybeSingle();
      error = res.error;
      data = res.data as CategoryDbRow | null;
    }
    if (!data && !error) {
      const res = await baseQuery().eq("slug", id).limit(1).maybeSingle();
      error = res.error;
      data = res.data as CategoryDbRow | null;
    }
    /** 정규화(NFC·decode)와 DB 저장 slug 문자열이 1글자라도 다르면 원문 세그먼트로 재시도 */
    if (!data && !error && rawTrim !== id) {
      const res = await baseQuery().eq("slug", rawTrim).limit(1).maybeSingle();
      error = res.error;
      data = res.data as CategoryDbRow | null;
    }

    if (error || !data) return null;
    return toCategoryWithSettings(data);
  } catch {
    return null;
  }
}

/** id로만 조회 (기존 호환) */
export async function getCategoryById(id: string): Promise<CategoryWithSettings | null> {
  return getCategoryBySlugOrId(id);
}
