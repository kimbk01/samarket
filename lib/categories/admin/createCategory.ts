"use client";

/**
 * 카테고리 추가 (categories + category_settings 동시 생성)
 * 서버 API (/api/admin/trade/categories) — 반영 확인·감사 포함
 */
import type { CategoryType, QuickCreateGroup } from "@/lib/categories/types";
import { postCategoryAdminOp } from "@/lib/categories/admin/category-admin-api";

export interface CreateCategoryPayload {
  name: string;
  name_en?: string | null;
  slug: string;
  icon_key: string;
  /** P-6: 주제 배지 색(#RRGGBB) · null = 기본 중립색 */
  badge_color?: string | null;
  type: CategoryType;
  sort_order: number;
  is_active: boolean;
  description?: string | null;
  quick_create_enabled?: boolean;
  quick_create_group?: QuickCreateGroup | null;
  quick_create_order?: number;
  show_in_home_chips?: boolean;
  /** 홈 1행 메뉴 하위 주제 */
  parent_id?: string | null;
}

export interface CreateCategorySettingsPayload {
  can_write: boolean;
  has_price: boolean;
  has_chat: boolean;
  has_location: boolean;
  has_direct_deal: boolean;
  has_free_share: boolean;
  post_type: string;
  field_composition?: unknown | null;
}

export type CreateCategoryResult = { ok: true; id: string } | { ok: false; error: string };

export async function createCategory(
  payload: CreateCategoryPayload,
  settings: CreateCategorySettingsPayload
): Promise<CreateCategoryResult> {
  const res = await postCategoryAdminOp<{ id: string }>({ op: "create", category: payload, settings });
  return res.ok ? { ok: true, id: res.id } : { ok: false, error: res.error };
}
