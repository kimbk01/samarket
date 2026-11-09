"use client";

/**
 * 관리자용 카테고리 전체 목록 (비활성 포함, sort_order → created_at 순)
 * Supabase categories + category_settings 조인
 *
 * 조회문·행 변환은 고객 화면과 같은 공용 함수(`selectCategoriesWithSettings` · `toCategoryWithSettings`)를 쓴다.
 * 예전에는 관리자 전용 SELECT·mapRow 를 따로 두어 P-6 `badge_color` 가 빠졌고,
 * 「거래 메뉴 설정」 이 배지 색을 빈칸으로 불러와 저장 시 지워졌다 (2026-11-08 환전거래).
 */
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { selectCategoriesWithSettings } from "@/lib/categories/query-categories-select";
import { toCategoryWithSettings, type CategoryDbRow } from "@/lib/categories/to-category-with-settings";

export type AdminCategoriesLoad =
  | { ok: true; data: CategoryWithSettings[] }
  | { ok: false; code: string; httpStatus: number };

/** 조회 결과를 오류와 구분해 돌려준다 (관리 화면의 오류·권한 없음 상태용) */
export async function loadAdminCategories(): Promise<AdminCategoriesLoad> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, code: "supabase_unavailable", httpStatus: 0 };

  try {
    const { data, error } = await selectCategoriesWithSettings(supabase as any, (selectFragment) =>
      (supabase as any)
        .from("categories")
        .select(selectFragment)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    );

    if (error) {
      const code = String((error as { code?: unknown }).code ?? "") || "categories_load_failed";
      // PostgREST 권한 거부(42501) → 권한 없음 화면
      return { ok: false, code, httpStatus: code === "42501" ? 403 : 500 };
    }
    if (!Array.isArray(data)) return { ok: false, code: "categories_load_failed", httpStatus: 500 };
    return { ok: true, data: (data as CategoryDbRow[]).map(toCategoryWithSettings) };
  } catch {
    return { ok: false, code: "network_error", httpStatus: 0 };
  }
}

/** 실패 시 빈 목록 (선택 상자 옵션 등 — 목록 화면이 아닌 보조 조회용) */
export async function getAdminCategories(): Promise<CategoryWithSettings[]> {
  const res = await loadAdminCategories();
  return res.ok ? res.data : [];
}
