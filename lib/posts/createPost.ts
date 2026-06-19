"use client";

/**
 * 카테고리 type + payload 기준 글 저장
 * - `POST /api/posts/create` (service_role INSERT — 클라이언트는 posts 직접 SELECT 불가)
 */
import type { CreatePostPayload, CreatePostResponse } from "./types";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { handleProfileIncompleteApiResponse } from "@/lib/profile/handle-profile-incomplete-api-response";

/** `TradeWriteForm` 등에서 업로드와 겹쳐 `userId` 를 미리 확보한 경우 중복 세션 조회 생략 */
export type CreatePostAuthPreflight = {
  userId: string;
  /** @deprecated 서버 `/api/posts/create` 가 actionType 별 프로필 gate 를 검증 */
  phoneGatePassed?: true;
};

export async function createPost(
  payload: CreatePostPayload,
  authPreflight?: CreatePostAuthPreflight
): Promise<CreatePostResponse> {
  const userId = authPreflight?.userId ?? (await getCurrentUserIdForDb());
  if (!userId) {
    return { ok: false, error: "로그인이 필요합니다. Supabase 로그인 후 다시 시도해 주세요." };
  }

  const title = payload.title?.trim() ?? "";
  const content = payload.content?.trim() ?? "";
  if (!title) return { ok: false, error: "제목을 입력해 주세요." };
  if (!content) return { ok: false, error: "내용을 입력해 주세요." };

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
        return { ok: false, error: profileHandled.error };
      }
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : "저장에 실패했습니다.",
      };
    }
    const id = typeof data.id === "string" ? data.id.trim() : "";
    if (!id) return { ok: false, error: "저장에 실패했습니다." };
    if (typeof window !== "undefined") {
      const { getCurrentUser } = await import("@/lib/auth/get-current-user");
      const { invalidateCommunityAuthorPostsClientCaches } = await import(
        "@/lib/community/invalidate-community-author-posts-client"
      );
      const uid = getCurrentUser()?.id?.trim() ?? userId.trim();
      if (uid) invalidateCommunityAuthorPostsClientCaches(uid);
    }
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error: (e as Error)?.message ?? "저장에 실패했습니다.",
    };
  }
}
