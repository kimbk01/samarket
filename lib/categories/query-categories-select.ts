import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import {
  CATEGORY_WITH_SETTINGS_SELECT,
  CATEGORY_WITH_SETTINGS_SELECT_LEGACY,
  CATEGORY_WITH_SETTINGS_SELECT_WITHOUT_FIELD_COMPOSITION,
} from "./category-select-fragment";

export function shouldRetryCategoriesWithoutNameEn(error: PostgrestError | null | undefined): boolean {
  return isMissingDbColumnError(error, "name_en");
}

export function shouldRetryCategoriesWithoutFieldComposition(
  error: PostgrestError | null | undefined
): boolean {
  return isMissingDbColumnError(error, "field_composition");
}

type CategoriesQueryResult = { data: unknown; error: PostgrestError | null };

/**
 * `categories` + `category_settings` —
 * field_composition → name_en 순으로 컬럼 누락 시 SELECT 폴백.
 */
export async function selectCategoriesWithSettings(
  supabase: SupabaseClient<any>,
  runQuery: (selectFragment: string) => PromiseLike<CategoriesQueryResult>
): Promise<{ data: unknown[] | null; error: PostgrestError | null }> {
  void supabase;
  const primary = await runQuery(CATEGORY_WITH_SETTINGS_SELECT);
  if (!primary.error) {
    return { data: Array.isArray(primary.data) ? primary.data : null, error: null };
  }
  if (shouldRetryCategoriesWithoutFieldComposition(primary.error)) {
    const mid = await runQuery(CATEGORY_WITH_SETTINGS_SELECT_WITHOUT_FIELD_COMPOSITION);
    if (!mid.error) {
      return { data: Array.isArray(mid.data) ? mid.data : null, error: null };
    }
    if (shouldRetryCategoriesWithoutNameEn(mid.error)) {
      const legacy = await runQuery(CATEGORY_WITH_SETTINGS_SELECT_LEGACY);
      return {
        data: Array.isArray(legacy.data) ? legacy.data : null,
        error: legacy.error ?? null,
      };
    }
    return { data: null, error: mid.error };
  }
  if (shouldRetryCategoriesWithoutNameEn(primary.error)) {
    const legacy = await runQuery(CATEGORY_WITH_SETTINGS_SELECT_LEGACY);
    return {
      data: Array.isArray(legacy.data) ? legacy.data : null,
      error: legacy.error ?? null,
    };
  }
  return { data: null, error: primary.error };
}
