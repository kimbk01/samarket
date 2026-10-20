"use client";

/**
 * 관리자용 카테고리 전체 목록 (비활성 포함, sort_order → created_at 순)
 * Supabase categories + category_settings 조인
 */
import type { CategoryWithSettings } from "@/lib/categories/types";
import { parseQuickCreateGroup } from "@/lib/categories/parseQuickCreateGroup";
import type { CategorySettingsRaw } from "@/lib/categories/normalizeCategorySettings";
import { normalizeCategorySettings } from "@/lib/categories/normalizeCategorySettings";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CATEGORY_WITH_SETTINGS_SELECT } from "@/lib/categories/category-select-fragment";

interface CategoryDbRow {
  id: string;
  name: string;
  name_en?: string | null;
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

function mapRow(row: CategoryDbRow): CategoryWithSettings {
  return {
    id: row.id,
    name: row.name,
    name_en: typeof row.name_en === "string" ? row.name_en.trim() || null : null,
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

export type AdminCategoriesLoad =
  | { ok: true; data: CategoryWithSettings[] }
  | { ok: false; code: string; httpStatus: number };

/** 조회 결과를 오류와 구분해 돌려준다 (관리 화면의 오류·권한 없음 상태용) */
export async function loadAdminCategories(): Promise<AdminCategoriesLoad> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, code: "supabase_unavailable", httpStatus: 0 };

  try {
    const { data, error } = await (supabase as any)
      .from("categories")
      .select(CATEGORY_WITH_SETTINGS_SELECT)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      const code = String((error as { code?: unknown }).code ?? "") || "categories_load_failed";
      // PostgREST 권한 거부(42501) → 권한 없음 화면
      return { ok: false, code, httpStatus: code === "42501" ? 403 : 500 };
    }
    if (!Array.isArray(data)) return { ok: false, code: "categories_load_failed", httpStatus: 500 };
    return { ok: true, data: (data as CategoryDbRow[]).map(mapRow) };
  } catch {
    return { ok: false, code: "network_error", httpStatus: 0 };
  }
}

/** 실패 시 빈 목록 (선택 상자 옵션 등 — 목록 화면이 아닌 보조 조회용) */
export async function getAdminCategories(): Promise<CategoryWithSettings[]> {
  const res = await loadAdminCategories();
  return res.ok ? res.data : [];
}
