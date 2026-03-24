"use client";

/**
 * 관리자 카테고리 CRUD + 순서 변경 + 설정
 * Supabase 연동 시 categories, category_settings 테이블 사용
 */
import type {
  CategoryRow,
  CategoryWithSettings,
  CategorySettingsRow,
  CategoryUpdatePayload,
  CategorySettingsUpdatePayload,
} from "@/lib/types/category";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  getCategoriesFallback,
  setCategoriesFallback,
  getCategoryByIdFallback,
  updateCategoryFallback,
  updateCategorySettingsFallback,
  reorderCategoriesFallback,
  addCategoryFallback,
  deleteCategoryFallback,
} from "./fallback-categories";

const now = () => new Date().toISOString();

/** 전체 목록 (비활성 포함, sort_order 순) */
export function adminGetCategories(): CategoryWithSettings[] {
  const supabase = getSupabaseClient();
  if (supabase) {
    // TODO: supabase.from('categories').select('*, category_settings(*)').order('sort_order')
  }
  return getCategoriesFallback();
}

/** 단건 조회 */
export function adminGetCategory(id: string): CategoryWithSettings | null {
  const supabase = getSupabaseClient();
  if (supabase) {
    // TODO: supabase.from('categories').select('*, category_settings(*)').eq('id', id).single()
  }
  return getCategoryByIdFallback(id);
}

/** 추가 */
export function adminCreateCategory(
  row: Omit<CategoryRow, "id" | "created_at" | "updated_at">,
  settings: Omit<CategorySettingsRow, "category_id">
): CategoryWithSettings {
  const supabase = getSupabaseClient();
  if (supabase) {
    // TODO: insert categories, then insert category_settings; return combined
  }
  return addCategoryFallback(row, settings);
}

/** 수정 */
export function adminUpdateCategory(id: string, payload: CategoryUpdatePayload): CategoryWithSettings | null {
  const supabase = getSupabaseClient();
  if (supabase) {
    // TODO: supabase.from('categories').update({ ...payload, updated_at: now() }).eq('id', id)
  }
  return updateCategoryFallback(id, payload);
}

/** 설정 수정 */
export function adminUpdateCategorySettings(
  categoryId: string,
  payload: CategorySettingsUpdatePayload
): void {
  const supabase = getSupabaseClient();
  if (supabase) {
    // TODO: supabase.from('category_settings').upsert({ category_id: categoryId, ...payload, updated_at: now() })
  }
  updateCategorySettingsFallback(categoryId, payload);
}

/** 삭제 */
export function adminDeleteCategory(id: string): boolean {
  const supabase = getSupabaseClient();
  if (supabase) {
    // TODO: delete category_settings then categories
  }
  return deleteCategoryFallback(id);
}

/** 순서 변경 (orderedIds: id 배열 순서대로 sort_order 부여) */
export function adminReorderCategories(orderedIds: string[]): void {
  const supabase = getSupabaseClient();
  if (supabase) {
    // TODO: orderedIds.forEach((id, i) => supabase.from('categories').update({ sort_order: i }).eq('id', id))
  }
  reorderCategoriesFallback(orderedIds);
}
