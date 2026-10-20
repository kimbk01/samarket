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

/** 관리자 카테고리 조회 결과 — 실패를 빈 목록으로 숨기지 않는다 (오류·권한 없음 화면 상태용). */
export type AdminCategoriesLoad =
  | { ok: true; rows: CategoryWithSettings[] }
  | { ok: false; code: string; httpStatus: number };

/**
 * 관리자 화면용 — 조회 오류를 코드로 돌려준다. 원문은 돌려주지 않는다 (화면은 오류 맵 `AdminErrorState` 로 표시).
 * 브라우저 Supabase 가 설정되지 않은 환경은 기존과 같이 빈 목록 (화면이 별도 안내를 띄운다).
 */
export async function loadAdminCategories(): Promise<AdminCategoriesLoad> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true, rows: [] };

  try {
    const { data, error, status } = await (supabase as any)
      .from("categories")
      .select(CATEGORY_WITH_SETTINGS_SELECT)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      const http = typeof status === "number" && status > 0 ? status : 500;
      const pgCode = String((error as { code?: unknown }).code ?? "");
      const forbidden = http === 401 || http === 403 || pgCode === "42501";
      return { ok: false, code: forbidden ? "forbidden_permission" : "server_error", httpStatus: forbidden ? 403 : http };
    }
    if (!Array.isArray(data)) return { ok: false, code: "server_error", httpStatus: 500 };
    return { ok: true, rows: (data as CategoryDbRow[]).map(mapRow) };
  } catch {
    return { ok: false, code: "network_error", httpStatus: 0 };
  }
}

/** 실패 시 빈 목록 — 필터 선택지처럼 없어도 화면이 동작하는 곳 전용. 관리 화면 본문은 `loadAdminCategories` 를 쓴다. */
export async function getAdminCategories(): Promise<CategoryWithSettings[]> {
  const r = await loadAdminCategories();
  return r.ok ? r.rows : [];
}
