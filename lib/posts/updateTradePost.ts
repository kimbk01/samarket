"use client";

import type { CreatePostPayload } from "./types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { PHONE_VERIFICATION_REQUIRED_MESSAGE } from "@/lib/auth/member-access";

export type UpdateTradePostResponse = { ok: true } | { ok: false; error: string };

type TradeUpdateBody = {
  categoryId: string;
  title: string;
  content: string;
  price: number | null;
  region?: string;
  city?: string;
  barangay?: string;
  imageUrls?: string[];
  meta?: Record<string, unknown> | null;
  isFreeShare?: boolean;
  isPriceOfferEnabled?: boolean;
};

/**
 * 본인 trade 글 수정 — RLS·세션은 Supabase 클라이언트 기준 (createPost 와 동일).
 */
export async function updateTradePost(
  postId: string,
  body: TradeUpdateBody
): Promise<UpdateTradePostResponse> {
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

  const title = body.title?.trim() ?? "";
  const content = body.content?.trim() ?? "";
  if (!title) return { ok: false, error: "제목을 입력해 주세요." };
  if (!content) return { ok: false, error: "내용을 입력해 주세요." };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    trade_category_id: body.categoryId,
    title,
    content,
    price: body.price != null ? Number(body.price) : null,
    updated_at: now,
  };

  if (body.region != null && String(body.region).trim()) patch.region = String(body.region).trim();
  else patch.region = null;
  if (body.city != null && String(body.city).trim()) patch.city = String(body.city).trim();
  else patch.city = null;
  if (body.barangay != null && String(body.barangay).trim()) patch.barangay = String(body.barangay).trim();
  else patch.barangay = null;

  if (Array.isArray(body.imageUrls)) {
    patch.images = body.imageUrls.length > 0 ? body.imageUrls : null;
    patch.thumbnail_url =
      body.imageUrls.length > 0 && typeof body.imageUrls[0] === "string" ? body.imageUrls[0] : null;
  }

  if (body.meta != null && typeof body.meta === "object" && Object.keys(body.meta).length > 0) {
    patch.meta = body.meta;
  } else if (body.meta === null) {
    patch.meta = null;
  }

  if (typeof body.isFreeShare === "boolean") patch.is_free_share = body.isFreeShare;
  if (typeof body.isPriceOfferEnabled === "boolean") patch.is_price_offer = body.isPriceOfferEnabled;

  try {
    const res = await (supabase as any)
      .from("posts")
      .update(patch)
      .eq("id", postId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (res.error) {
      return { ok: false, error: (res.error as { message?: string }).message ?? "저장에 실패했습니다." };
    }
    if (!res.data) {
      return { ok: false, error: "글을 찾을 수 없거나 수정 권한이 없습니다." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "저장에 실패했습니다." };
  }
}

/** createPost trade 페이로드와 동일 형태로 갱신 */
export async function updateTradePostFromCreatePayload(
  postId: string,
  payload: Extract<CreatePostPayload, { type: "trade" }>
): Promise<UpdateTradePostResponse> {
  return updateTradePost(postId, {
    categoryId: payload.categoryId,
    title: payload.title,
    content: payload.content,
    price: payload.price != null ? Number(payload.price) : null,
    region: payload.region,
    city: payload.city,
    barangay: payload.barangay,
    imageUrls: payload.imageUrls,
    meta: payload.meta ?? undefined,
    isFreeShare: payload.isFreeShare,
    isPriceOfferEnabled: payload.isPriceOfferEnabled,
  });
}
