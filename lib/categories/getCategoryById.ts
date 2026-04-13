"use client";

/**
 * 카테고리 단건 조회 (id 또는 slug로 조회)
 * 목록 페이지 상단 메타/타입 검증용
 */
import type { CategoryWithSettings } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { normalizeMarketSlugParam } from "./tradeMarketPath";
import { readCategoryCache, writeCategoryCache } from "./category-memory-cache";
import { CATEGORY_WITH_SETTINGS_SELECT } from "./category-select-fragment";
import {
  toCategoryWithSettings,
  type CategoryDbRow,
} from "./to-category-with-settings";

export { toCategoryWithSettings, type CategoryDbRow };

const CATEGORY_BY_KEY_TTL_MS = 60_000;

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
        .select(CATEGORY_WITH_SETTINGS_SELECT);

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
