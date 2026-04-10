"use client";

import type { CreatePostPayload } from "./types";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { assertPhoneAllowsPostWrite } from "@/lib/posts/phone-gate-for-post-write";

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
  /** 협의·진행 단계 본문 append */
  descriptionAppend?: string | null;
};

/**
 * 본인 trade 글 수정 — 서버 API에서 거래 라이프사이클·핵심 필드 검증.
 */
export async function updateTradePost(postId: string, body: TradeUpdateBody): Promise<UpdateTradePostResponse> {
  const [userId, gate] = await Promise.all([getCurrentUserIdForDb(), assertPhoneAllowsPostWrite()]);
  if (!userId) {
    return { ok: false, error: "로그인이 필요합니다. Supabase 로그인 후 다시 시도해 주세요." };
  }
  if (!gate.ok) {
    return { ok: false, error: gate.error };
  }

  const title = body.title?.trim() ?? "";
  const content = body.content?.trim() ?? "";
  if (!title) return { ok: false, error: "제목을 입력해 주세요." };
  if (!content && !body.descriptionAppend?.trim()) return { ok: false, error: "내용을 입력해 주세요." };

  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/owner-trade-update`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: body.categoryId,
        title,
        content,
        price: body.price,
        region: body.region,
        city: body.city,
        barangay: body.barangay,
        imageUrls: body.imageUrls,
        meta: body.meta ?? undefined,
        isFreeShare: body.isFreeShare,
        isPriceOfferEnabled: body.isPriceOfferEnabled,
        descriptionAppend: body.descriptionAppend ?? undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: typeof data.error === "string" ? data.error : "저장에 실패했습니다." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "저장에 실패했습니다." };
  }
}

/** createPost trade 페이로드와 동일 형태로 갱신 */
export async function updateTradePostFromCreatePayload(
  postId: string,
  payload: Extract<CreatePostPayload, { type: "trade" }>,
  opts?: { descriptionAppend?: string | null }
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
    descriptionAppend: opts?.descriptionAppend,
  });
}
