"use client";

/**
 * 관리자 카테고리 수정 (categories + category_settings 동시 반영)
 * 서버 API (/api/admin/trade/categories)
 */
import type { CategoryType } from "@/lib/categories/types";
import { postCategoryAdminOp } from "@/lib/categories/admin/category-admin-api";

import type { QuickCreateGroup } from "@/lib/categories/types";

export interface UpdateCategoryPayload {
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
  parent_id?: string | null;
}

export interface UpdateCategorySettingsPayload {
  can_write: boolean;
  has_price: boolean;
  has_chat: boolean;
  has_location: boolean;
  has_direct_deal: boolean;
  has_free_share: boolean;
  post_type: string;
  /** Admin V1 Field Composition overlay — approved Field Library ids only */
  field_composition?: unknown | null;
}

export type UpdateCategoryResult = { ok: true } | { ok: false; error: string };

export async function updateCategoryAdmin(
  id: string,
  payload: UpdateCategoryPayload,
  settings: UpdateCategorySettingsPayload
): Promise<UpdateCategoryResult> {
  // 행·설정을 한 요청으로 (서버가 반영 행 확인 + 감사)
  const res = await postCategoryAdminOp({ op: "update", id, category: payload, settings });
  return res.ok ? { ok: true } : res;
}
