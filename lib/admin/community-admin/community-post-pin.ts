/**
 * 커뮤니티 게시글 상단 고정 (설계 §F-5-2 · M10). 한도(피드 3 · 카테고리 2)는 DB 함수가 잠금 후 검사한다.
 * 서버 전용.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CommunityPinScope = "feed" | "topic";

export function parseCommunityPinScope(raw: unknown): CommunityPinScope | null {
  return raw === "feed" || raw === "topic" ? raw : null;
}

export type SetPinResult =
  | { ok: true; limit: number; count: number }
  | { ok: false; error: string; httpStatus: number; limit?: number };

const PIN_ERROR_STATUS: Record<string, number> = {
  pin_limit: 409,
  not_active: 409,
  no_topic: 400,
  invalid_until: 400,
  invalid_scope: 400,
  not_found: 404,
  forbidden: 500,
};

export async function setCommunityPostPin(
  sb: SupabaseClient,
  input: {
    postId: string;
    actorId: string;
    scope: CommunityPinScope;
    until: string | null;
    rank: number;
    reason: string;
  }
): Promise<SetPinResult> {
  const { data, error } = await sb.rpc("admin_set_community_post_pin", {
    p_post_id: input.postId,
    p_actor_id: input.actorId,
    p_scope: input.scope,
    p_until: input.until,
    p_rank: input.rank,
    p_reason: input.reason,
  });
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    const code = String(r.error ?? "rpc_failed");
    return {
      ok: false,
      error: code,
      httpStatus: PIN_ERROR_STATUS[code] ?? 400,
      ...(r.limit != null ? { limit: Number(r.limit) } : {}),
    };
  }
  return { ok: true, limit: Number(r.limit ?? 0), count: Number(r.count ?? 0) };
}

export const COMMUNITY_POST_PIN_CLEAR_PATCH = {
  pinned_at: null,
  pinned_until: null,
  pinned_by: null,
  pin_scope: null,
  pin_rank: 0,
  pin_reason: null,
} as const;
