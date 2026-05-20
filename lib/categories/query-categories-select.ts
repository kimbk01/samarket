import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import {
  CATEGORY_WITH_SETTINGS_SELECT,
  CATEGORY_WITH_SETTINGS_SELECT_LEGACY,
} from "./category-select-fragment";

export function shouldRetryCategoriesWithoutNameEn(error: PostgrestError | null | undefined): boolean {
  return isMissingDbColumnError(error, "name_en");
}

type CategoriesQueryResult = { data: unknown; error: PostgrestError | null };

/**
 * `categories` + `category_settings` — `name_en` 있으면 포함, 없으면 레거시 SELECT 1회 재시도.
 */
export async function selectCategoriesWithSettings(
  supabase: SupabaseClient<any>,
  runQuery: (selectFragment: string) => PromiseLike<CategoriesQueryResult>
): Promise<{ data: unknown[] | null; error: PostgrestError | null }> {
  const primary = await runQuery(CATEGORY_WITH_SETTINGS_SELECT);
  const { data, error } = primary;
  if (!error) {
    return { data: Array.isArray(data) ? data : null, error: null };
  }
  if (!shouldRetryCategoriesWithoutNameEn(error)) {
    return { data: null, error };
  }
  const legacy = await runQuery(CATEGORY_WITH_SETTINGS_SELECT_LEGACY);
  return {
    data: Array.isArray(legacy.data) ? legacy.data : null,
    error: legacy.error ?? null,
  };
}
