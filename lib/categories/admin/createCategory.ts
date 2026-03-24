"use client";

/**
 * 카테고리 추가 (categories + category_settings 동시 생성)
 * RLS: 관리자만 insert 가능
 */
import type { CategoryType, QuickCreateGroup } from "@/lib/categories/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export interface CreateCategoryPayload {
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
}

export type CreateCategoryResult = { ok: true; id: string } | { ok: false; error: string };

export async function createCategory(
  payload: CreateCategoryPayload,
  settings: CreateCategorySettingsPayload
): Promise<CreateCategoryResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      error: "Supabase를 사용할 수 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정한 뒤 개발 서버를 재시작해 주세요.",
    };
  }

  try {
    const { data: cat, error: catError } = await (supabase as any)
      .from("categories")
      .insert({
        name: payload.name,
        slug: payload.slug,
        icon_key: payload.icon_key,
        type: payload.type,
        sort_order: payload.sort_order,
        is_active: payload.is_active,
        description: payload.description ?? null,
        quick_create_enabled: payload.quick_create_enabled ?? false,
        quick_create_group: payload.quick_create_group ?? null,
        quick_create_order: payload.quick_create_order ?? 0,
        show_in_home_chips: payload.show_in_home_chips ?? true,
        parent_id: payload.parent_id ?? null,
      })
      .select("id")
      .single();

    if (catError || !cat?.id) {
      return { ok: false, error: (catError as { message?: string })?.message ?? "카테고리 생성에 실패했습니다." };
    }

    const { error: setError } = await (supabase as any)
      .from("category_settings")
      .insert({
        category_id: cat.id,
        can_write: settings.can_write,
        has_price: settings.has_price,
        has_chat: settings.has_chat,
        has_location: settings.has_location,
        has_direct_deal: settings.has_direct_deal ?? true,
        has_free_share: settings.has_free_share ?? true,
        post_type: settings.post_type,
      });

    if (setError) {
      return { ok: false, error: (setError as { message?: string })?.message ?? "기능 설정 저장에 실패했습니다." };
    }
    return { ok: true, id: cat.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "생성에 실패했습니다." };
  }
}
