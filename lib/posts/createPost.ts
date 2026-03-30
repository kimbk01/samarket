"use client";

/**
 * 카테고리 type + payload 기준 글 저장
 * - Supabase posts 테이블 사용 (없으면 에러 반환, mock 미사용)
 */
import type { CreatePostPayload, CreatePostResponse } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { PHONE_VERIFICATION_REQUIRED_MESSAGE } from "@/lib/auth/member-access";

export async function createPost(payload: CreatePostPayload): Promise<CreatePostResponse> {
  const userId = await getCurrentUserIdForDb();
  if (!userId) {
    return { ok: false, error: "로그인이 필요합니다. Supabase 로그인 후 다시 시도해 주세요." };
  }

  const profile = await getMyProfile();
  if (profile && profile.role !== "admin" && profile.role !== "master" && !profile.phone_verified) {
    return { ok: false, error: PHONE_VERIFICATION_REQUIRED_MESSAGE };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "저장 기능을 사용할 수 없습니다." };
  }

  const title = payload.title?.trim() ?? "";
  const content = payload.content?.trim() ?? "";
  if (!title) return { ok: false, error: "제목을 입력해 주세요." };
  if (!content) return { ok: false, error: "내용을 입력해 주세요." };

  try {
    const now = new Date().toISOString();
    const categoryId = payload.categoryId;

    // DB 스키마 통일: trade_category_id, user_id 사용. 선택 컬럼(region/city/images 등) 제외.
    const row: Record<string, unknown> = {
      user_id: userId,
      trade_category_id: categoryId,
      title,
      content,
      status: "active",
      view_count: 0,
      created_at: now,
      updated_at: now,
    };

    if (payload.type === "trade" && "price" in payload) {
      row.price = payload.price != null ? Number(payload.price) : null;
    }

    if (payload.type === "trade" && "imageUrls" in payload && Array.isArray(payload.imageUrls) && payload.imageUrls.length > 0) {
      row.images = payload.imageUrls;
    }

    if (payload.type === "trade" && "region" in payload && payload.region != null && String(payload.region).trim()) {
      row.region = payload.region.trim();
    }
    if (payload.type === "trade" && "city" in payload && payload.city != null && String(payload.city).trim()) {
      row.city = payload.city.trim();
    }
    if (payload.type === "trade" && "barangay" in payload && payload.barangay != null && String(payload.barangay).trim()) {
      row.barangay = String(payload.barangay).trim();
    }
    if (payload.type === "trade" && "meta" in payload && payload.meta != null && typeof payload.meta === "object" && Object.keys(payload.meta).length > 0) {
      row.meta = payload.meta;
    }
    if (payload.type === "trade" && "isFreeShare" in payload) {
      row.is_free_share = payload.isFreeShare === true;
    }
    if (payload.type === "trade" && "isPriceOfferEnabled" in payload) {
      row.is_price_offer = payload.isPriceOfferEnabled === true;
    }

    const res = await (supabase as any).from("posts").insert(row).select("id").single();

    if (res.error) {
      return { ok: false, error: (res.error as { message?: string }).message ?? "저장에 실패했습니다." };
    }
    const id = res.data?.id ?? "";
    if (!id) return { ok: false, error: "저장에 실패했습니다." };
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error: (e as Error)?.message ?? "저장에 실패했습니다.",
    };
  }
}
