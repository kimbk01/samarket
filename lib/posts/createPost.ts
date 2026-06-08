"use client";

/**
 * 카테고리 type + payload 기준 글 저장
 * - `POST /api/posts/create` (service_role INSERT — 클라이언트는 posts 직접 SELECT 불가)
 */
import type { CreatePostPayload, CreatePostResponse } from "./types";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { assertPhoneAllowsPostWrite } from "@/lib/posts/phone-gate-for-post-write";

/** `TradeWriteForm` 등에서 업로드와 겹쳐 `userId`·전화 게이트를 미리 통과시킨 경우 중복 네트워크 생략 */
export type CreatePostAuthPreflight = {
  userId: string;
  phoneGatePassed: true;
};

export async function createPost(
  payload: CreatePostPayload,
  authPreflight?: CreatePostAuthPreflight
): Promise<CreatePostResponse> {
  if (authPreflight?.phoneGatePassed && authPreflight.userId) {
    /* 서버 API가 세션·전화 게이트를 재검증 — 클라이언트 preflight는 UX용 중복 생략만 */
  } else {
    const [uid, gate] = await Promise.all([getCurrentUserIdForDb(), assertPhoneAllowsPostWrite()]);
    if (!uid) {
      return { ok: false, error: "로그인이 필요합니다. Supabase 로그인 후 다시 시도해 주세요." };
    }
    if (!gate.ok) {
      return { ok: false, error: gate.error };
    }
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
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : "저장에 실패했습니다.",
      };
    }
    const id = typeof data.id === "string" ? data.id.trim() : "";
    if (!id) return { ok: false, error: "저장에 실패했습니다." };
    return { ok: true, id };
  } catch (e) {
    return {
      ok: false,
      error: (e as Error)?.message ?? "저장에 실패했습니다.",
    };
  }
}
