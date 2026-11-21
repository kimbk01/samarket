import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { toggleCommentLikeServer } from "@/lib/community/comment-mutations.server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { getNeighborhoodDevSamplePost } from "@/lib/neighborhood/dev-sample-data";
import { jsonError, jsonOk, safeErrorMessage } from "@/lib/http/api-route";
import { logServerPerf } from "@/lib/performance/samarket-perf";
import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ postId: string; commentId: string }> }
) {
  const startedAt = Date.now();
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { postId, commentId } = await ctx.params;
  const rawP = postId?.trim() ?? "";
  const rawC = commentId?.trim() ?? "";
  if (!rawP || !rawC) return jsonError("요청이 올바르지 않습니다.", 400);

  if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(rawP)) {
    return jsonOk({ liked: true, like_count: 0, fallback: "dev_samples" });
  }
  const id = await resolveCanonicalCommunityPostId(rawP);
  if (!id) return jsonError("not_found", 404);
  /** 섞인 경로(설계 2026-11-21 §4 C, 재감사3 #2) — 추가만 가입 확인, 해제는 가입 없이 */
  const likeSb = tryCreateSupabaseServiceClient();
  if (!likeSb) return jsonError("supabase_unconfigured", 503);
  const { data: existingLike, error: existingLikeErr } = await likeSb
    .from("community_comment_likes")
    .select("id")
    .eq("comment_id", rawC)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (existingLikeErr) return jsonError("like_failed", 500);
  if (!existingLike) {
    const registrationGate = await requireRegistrationForAction(auth.userId);
    if (registrationGate) return registrationGate;
  }
  const out = await toggleCommentLikeServer(id, rawC, auth.userId);
  logServerPerf("community-comment-like.post", {
    postId: id,
    commentId: rawC,
    ok: out.ok,
    elapsedMs: Date.now() - startedAt,
  });
  if (!out.ok) {
    const status = out.code === "community_like_blocked_relation" ? 403 : 400;
    return jsonError(safeErrorMessage({ message: out.error }, out.error), status, {
      code: out.code,
    });
  }
  return jsonOk({ liked: out.liked, like_count: out.like_count });
}
