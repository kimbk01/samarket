"use client";

/**
 * 관리자 카테고리 수정 (categories + category_settings 동시 반영)
 * RLS: 관리자만 update 가능
 */
import type { CategoryType } from "@/lib/categories/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { updateCategory as updateCategoryRow } from "@/lib/categories/updateCategory";
import { upsertCategorySettings } from "@/lib/categories/upsertCategorySettings";

import type { QuickCreateGroup } from "@/lib/categories/types";

export interface UpdateCategoryPayload {
  name: string;
  slug: string;
  icon_key: string;
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
}

export type UpdateCategoryResult = { ok: true } | { ok: false; error: string };

export async function updateCategoryAdmin(
  id: string,
  payload: UpdateCategoryPayload,
  settings: UpdateCategorySettingsPayload
): Promise<UpdateCategoryResult> {
  const res = await updateCategoryRow(id, payload);
  if (!res.ok) return res;
  const setRes = await upsertCategorySettings(id, settings);
  return setRes;
}
