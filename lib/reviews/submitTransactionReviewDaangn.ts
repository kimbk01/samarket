"use client";

import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ReviewRoleType, PublicReviewType } from "@/lib/types/daangn";

export type SubmitTransactionReviewResult = { ok: true } | { ok: false; error: string };

export interface SubmitTransactionReviewPayload {
  productId: string;
  roomId: string;
  revieweeId: string;
  roleType: ReviewRoleType;
  publicReviewType: PublicReviewType;
  privateMannerScore?: number | null;
  privateTags?: string[];
  isAnonymousNegative?: boolean;
}

/**
 * 당근형: 거래 후기 제출 (당사자 1회만, 거래완료 후)
 */
export async function submitTransactionReviewDaangn(
  payload: SubmitTransactionReviewPayload
): Promise<SubmitTransactionReviewResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "기능을 사용할 수 없습니다." };

  const sb = supabase as any;

  const { data: room } = await sb
    .from("product_chats")
    .select("id, seller_id, buyer_id, post_id")
    .eq("id", payload.roomId)
    .single();

  if (!room || room.post_id !== payload.productId)
    return { ok: false, error: "해당 거래 채팅방이 아닙니다." };
  if (room.seller_id !== user.id && room.buyer_id !== user.id)
    return { ok: false, error: "거래 당사자만 후기를 남길 수 있습니다." };
  if (payload.revieweeId !== room.seller_id && payload.revieweeId !== room.buyer_id)
    return { ok: false, error: "상대방 정보가 올바르지 않습니다." };

  const { data: post } = await sb.from(POSTS_TABLE_READ).select("status").eq("id", payload.productId).single();
  if (post?.status !== "sold") return { ok: false, error: "거래가 완료된 후에 후기를 남길 수 있습니다." };

  const { data: existing } = await sb
    .from("transaction_reviews")
    .select("id")
    .eq("product_id", payload.productId)
    .eq("reviewer_id", user.id)
    .eq("reviewee_id", payload.revieweeId)
    .maybeSingle();
  if (existing) return { ok: false, error: "이미 해당 거래에 대한 후기를 남기셨습니다." };

  const { error } = await sb.from("transaction_reviews").insert({
    product_id: payload.productId,
    room_id: payload.roomId,
    reviewer_id: user.id,
    reviewee_id: payload.revieweeId,
    role_type: payload.roleType,
    public_review_type: payload.publicReviewType,
    private_manner_score: payload.privateMannerScore ?? null,
    private_tags: payload.privateTags ?? [],
    is_anonymous_negative: payload.isAnonymousNegative ?? false,
  });

  if (error) return { ok: false, error: error.message ?? "후기 등록에 실패했습니다." };
  return { ok: true };
}
