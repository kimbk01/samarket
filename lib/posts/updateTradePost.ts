"use client";

import type { CreatePostPayload } from "./types";
import type { TradeJobColumnPayload } from "@/lib/posts/trade-job-db-fields";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { pickApiErrorCode, pickApiErrorParams } from "@/lib/i18n/api-error-text";

/**
 * 실패 시 `error` = 오류 코드 — 화면 문구는 `tradeWriteErrorText`(`lib/trade/trade-api-error-text.ts`).
 * `blockedReason` 은 가입·로그인 막힘 판정용 서버 원문(화면 표시 금지).
 */
export type UpdateTradePostResponse =
  | { ok: true }
  | {
      ok: false;
      error: string;
      status?: number;
      params?: Record<string, string | number>;
      blockedReason?: string;
    };

type TradeUpdateBody = {
  categoryId: string;
  title: string;
  content: string;
  price: number | null;
  region?: string;
  city?: string;
  tradeLguId?: string;
  /** 서버가 이 주소로 위치를 정한다(주소 SSOT) */
  tradeAddressId?: string;
  barangay?: string;
  imageUrls?: string[];
  meta?: Record<string, unknown> | null;
  isFreeShare?: boolean;
  isPriceOfferEnabled?: boolean;
  /** 협의·진행 단계 본문 append */
  descriptionAppend?: string | null;
  tradeJob?: TradeJobColumnPayload | null;
};

/**
 * 본인 trade 글 수정 — 서버 API에서 거래 라이프사이클·핵심 필드 검증.
 */
export async function updateTradePost(postId: string, body: TradeUpdateBody): Promise<UpdateTradePostResponse> {
  const userId = await getCurrentUserIdForDb();
  if (!userId) {
    return { ok: false, error: "login_required", status: 401, blockedReason: "unauthorized" };
  }

  const title = body.title?.trim() ?? "";
  const content = body.content?.trim() ?? "";
  if (!title) return { ok: false, error: "title_required" };
  if (!content && !body.descriptionAppend?.trim()) return { ok: false, error: "content_required" };

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
        tradeLguId: body.tradeLguId,
        barangay: body.barangay,
        imageUrls: body.imageUrls,
        meta: body.meta ?? undefined,
        isFreeShare: body.isFreeShare,
        isPriceOfferEnabled: body.isPriceOfferEnabled,
        descriptionAppend: body.descriptionAppend ?? undefined,
        tradeJob: body.tradeJob ?? undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
    if (!res.ok || !data.ok) {
      const params = pickApiErrorParams(data);
      const blockedReason = typeof data.error === "string" ? data.error.trim() : "";
      return {
        ok: false,
        error: pickApiErrorCode(data) ?? "save_failed",
        status: res.status,
        ...(params ? { params } : {}),
        ...(blockedReason ? { blockedReason } : {}),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
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
    tradeLguId: payload.tradeLguId,
    barangay: payload.barangay,
    imageUrls: payload.imageUrls,
    meta: payload.meta ?? undefined,
    isFreeShare: payload.isFreeShare,
    isPriceOfferEnabled: payload.isPriceOfferEnabled,
    descriptionAppend: opts?.descriptionAppend,
    tradeJob: payload.tradeJob,
  });
}
