"use client";

/**
 * 카테고리 설정 upsert (Supabase category_settings)
 * - category_id 기준으로 있으면 update, 없으면 insert
 * - RLS: 관리자만 insert/update 가능
 */
import type { CategorySettingsUpdatePayload } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";

export type UpsertCategorySettingsResult = { ok: true } | { ok: false; error: string };

const DEFAULTS = {
  can_write: true,
  has_price: false,
  has_chat: false,
  has_location: true,
  has_direct_deal: true,
  has_free_share: true,
  post_type: "normal",
};

export async function upsertCategorySettings(
  categoryId: string,
  payload: CategorySettingsUpdatePayload
): Promise<UpsertCategorySettingsResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase를 사용할 수 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정한 뒤 개발 서버를 재시작해 주세요." };
  }

  const row = { ...DEFAULTS, ...payload, category_id: categoryId, updated_at: new Date().toISOString() };

  try {
     
    const { error } = await (supabase as any)
      .from("category_settings")
      .upsert(row, { onConflict: "category_id" });

    if (error) return { ok: false, error: (error as { message?: string }).message ?? "저장에 실패했습니다." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "저장에 실패했습니다." };
  }
}
