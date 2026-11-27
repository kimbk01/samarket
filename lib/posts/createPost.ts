"use client";

/**
 * 카테고리 type + payload 기준 글 저장
 * - `POST /api/posts/create` (service_role INSERT — 클라이언트는 posts 직접 SELECT 불가)
 */
import type { CreatePostPayload, CreatePostResult } from "./types";
import { pickApiErrorCode, pickApiErrorParams } from "@/lib/i18n/api-error-text";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { handleProfileIncompleteApiResponse } from "@/lib/profile/handle-profile-incomplete-api-response";

/** `TradeWriteForm` 등에서 업로드와 겹쳐 `userId` 를 미리 확보한 경우 중복 세션 조회 생략 */
export type CreatePostAuthPreflight = {
  userId: string;
  /** @deprecated 서버 `/api/posts/create` 가 actionType 별 프로필 gate 를 검증 */
  phoneGatePassed?: true;
};

/**
 * 실패 시 `error` = 오류 코드(서버 `code`/`error` 코드 모양 · 없으면 `post_save_failed`).
 * 화면 문구는 `tradeWriteErrorText`(`lib/trade/trade-api-error-text.ts`) — 서버 문장은 돌려주지 않는다.
 * `blockedReason` 은 가입·로그인 막힘 판정용 서버 원문(화면 표시 금지).
 */
export type CreatePostClientError = {
  ok: false;
  error: string;
  status?: number;
  params?: Record<string, string | number>;
  blockedReason?: string;
};
export type CreatePostClientResponse = CreatePostResult | CreatePostClientError;

export async function createPost(
  payload: CreatePostPayload,
  authPreflight?: CreatePostAuthPreflight
): Promise<CreatePostClientResponse> {
  const userId = authPreflight?.userId ?? (await getCurrentUserIdForDb());
  if (!userId) {
    return { ok: false, error: "login_required", status: 401, blockedReason: "unauthorized" };
  }

  const title = payload.title?.trim() ?? "";
  const content = payload.content?.trim() ?? "";
  if (!title) return { ok: false, error: "title_required" };
  if (!content) return { ok: false, error: "content_required" };

  try {
    const res = await fetch("/api/posts/create", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as Parameters<
      typeof handleProfileIncompleteApiResponse
    >[0] & { ok?: boolean; id?: string; error?: string };
    if (!res.ok || !data.ok) {
      const profileHandled = handleProfileIncompleteApiResponse(data);
      if (profileHandled.handled) {
        return { ok: false, error: "profile_incomplete", status: res.status };
      }
      const params = pickApiErrorParams(data);
      const blockedReason = typeof data.error === "string" ? data.error.trim() : "";
      return {
        ok: false,
        error: pickApiErrorCode(data) ?? "post_save_failed",
        status: res.status,
        ...(params ? { params } : {}),
        ...(blockedReason ? { blockedReason } : {}),
      };
    }
    const id = typeof data.id === "string" ? data.id.trim() : "";
    if (!id) return { ok: false, error: "post_save_failed" };
    if (typeof window !== "undefined") {
      const { getCurrentUser } = await import("@/lib/auth/get-current-user");
      const { invalidateCommunityAuthorPostsClientCaches } = await import(
        "@/lib/community/invalidate-community-author-posts-client"
      );
      const uid = getCurrentUser()?.id?.trim() ?? userId.trim();
      if (uid) invalidateCommunityAuthorPostsClientCaches(uid);
    }
    return { ok: true, id };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
