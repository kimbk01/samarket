"use client";

/**
 * 카테고리 목록 조회 (Supabase categories + category_settings)
 * - sort_order 순, is_active 필터 가능
 * - mock 미의존, Supabase 없으면 빈 배열
 */
import type { CategoryWithSettings } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { writeCategoryCache } from "./category-memory-cache";
import { selectCategoriesWithSettings } from "./query-categories-select";
import { toCategoryWithSettings, type CategoryDbRow } from "./to-category-with-settings";
import { normalizeMarketSlugParam } from "./tradeMarketPath";

/** `getCategoryBySlugOrId` 와 동일 키 규칙으로 채워, 목록 직후 단건 조회 네트워크를 피함 */
function primeCategoryByKeyMemoryCache(list: CategoryWithSettings[]): void {
  for (const c of list) {
    const idRaw = c.id.trim();
    if (idRaw) {
      writeCategoryCache(`cat:${normalizeMarketSlugParam(idRaw)}:${idRaw}`, c);
    }
    const slugRaw = c.slug?.trim();
    if (slugRaw) {
      writeCategoryCache(`cat:${normalizeMarketSlugParam(slugRaw)}:${slugRaw}`, c);
    }
  }
}

/** D3 — 같은 조건 목록은 60초 동안 한 번만 받는다(화면마다 다시 묻지 않음). CDN 캐시와 같은 주기. */
const CATEGORY_LIST_CLIENT_TTL_MS = 60_000;
const listCache = new Map<string, { at: number; list: CategoryWithSettings[] }>();
const listInflight = new Map<string, Promise<CategoryWithSettings[]>>();

/** 테스트 전용 */
export function __resetCategoryListCacheForTests(): void {
  listCache.clear();
  listInflight.clear();
}

/**
 * D3 (2026-11-19) — 활성 목록은 같은 출처 캐시 API(`/api/public/categories`)로 받는다.
 * 앱이 Supabase 를 직접 부르면 요청마다 CORS 사전 요청(OPTIONS)까지 2건이 되고 캐시가 없었다(운영 11-18: GET 2,287 + OPTIONS 1,559/일).
 * API 실패 시 기존 직접 조회로 폴백 — 결과 모양(CategoryWithSettings[])은 같다.
 */
async function fetchActiveCategoryRowsFromPublicApi(type: string | undefined): Promise<CategoryDbRow[] | null> {
  if (typeof fetch !== "function") return null;
  try {
    const qs = type ? `?type=${encodeURIComponent(type)}` : "";
    const res = await fetch(`/api/public/categories${qs}`, { credentials: "omit" });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; rows?: unknown };
    if (json?.ok !== true || !Array.isArray(json.rows)) return null;
    return json.rows as CategoryDbRow[];
  } catch {
    return null;
  }
}

async function getCategoriesDirect(filters: {
  type?: "trade" | "service" | "community" | "feature";
  activeOnly: boolean;
}): Promise<CategoryWithSettings[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await selectCategoriesWithSettings(supabase as never, (cols) => {
      let q = (supabase as any).from("categories").select(cols);
      if (filters.activeOnly) q = q.eq("is_active", true);
      if (filters.type) q = q.eq("type", filters.type);
      return q.order("sort_order", { ascending: true });
    });
    if (error || !Array.isArray(data)) return [];
    return (data as CategoryDbRow[]).map(toCategoryWithSettings);
  } catch {
    return [];
  }
}

export async function getCategories(filters?: {
  type?: "trade" | "service" | "community" | "feature";
  activeOnly?: boolean;
}): Promise<CategoryWithSettings[]> {
  const activeOnly = filters?.activeOnly !== false;
  const type = filters?.type;

  /** 비활성 포함 조회는 공개 API 범위 밖 — 기존 직접 조회 그대로 */
  if (!activeOnly) {
    const list = await getCategoriesDirect({ type, activeOnly: false });
    primeCategoryByKeyMemoryCache(list);
    return list;
  }

  const key = type ?? "*";
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < CATEGORY_LIST_CLIENT_TTL_MS) return hit.list;
  const pending = listInflight.get(key);
  if (pending) return pending;

  const run = (async () => {
    const rows = await fetchActiveCategoryRowsFromPublicApi(type);
    const list = rows ? rows.map(toCategoryWithSettings) : await getCategoriesDirect({ type, activeOnly: true });
    primeCategoryByKeyMemoryCache(list);
    /** 빈 목록(실패 가능)은 캐시하지 않는다 — 다음 화면에서 다시 시도 */
    if (list.length > 0) listCache.set(key, { at: Date.now(), list });
    return list;
  })().finally(() => {
    listInflight.delete(key);
  });
  listInflight.set(key, run);
  return run;
}
