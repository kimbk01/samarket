import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { setCommentLikeServer } from "@/lib/community/comment-mutations.server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { getNeighborhoodDevSamplePost } from "@/lib/neighborhood/dev-sample-data";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";
import { logServerPerf } from "@/lib/performance/samarket-perf";
import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /…/comments/:commentId/like  body `{ liked: boolean }`
 * 「원하는 상태」 저장 — 토글이 아니라 재시도해도 같은 결과 (감사 L6·L17 · 설계 §6.4).
 * 공감 추가만 가입 확인(설계 2026-11-21 §4 C), 해제는 가입 없이.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ postId: string; commentId: string }> }
) {
  const startedAt = Date.now();
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { postId, commentId } = await ctx.params;
  const rawP = postId?.trim() ?? "";
  const rawC = commentId?.trim() ?? "";
  if (!rawP || !rawC) return jsonError("invalid_request", { status: 400, code: "invalid_request" });

  const parsed = await parseJsonBody<{ liked?: unknown }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const liked = parsed.value.liked;
  if (typeof liked !== "boolean") return jsonError("invalid_request", { status: 400, code: "invalid_request" });

  const rateLimit = await enforceRateLimit({
    key: `community-comment:like:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "community_comment_rate_limited",
    code: "community_comment_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(rawP)) {
    return jsonOk({ liked, like_count: 0, fallback: "dev_samples" });
  }
  const id = await resolveCanonicalCommunityPostId(rawP);
  if (!id) return jsonError("not_found", { status: 404, code: "not_found" });
  if (liked) {
    const registrationGate = await requireRegistrationForAction(auth.userId);
    if (registrationGate) return registrationGate;
  }
  const out = await setCommentLikeServer(id, rawC, auth.userId, liked);
  logServerPerf("community-comment-like.post", {
    postId: id,
    commentId: rawC,
    ok: out.ok,
    elapsedMs: Date.now() - startedAt,
  });
  if (!out.ok) {
    const code = out.code ?? out.error;
    const status =
      code === "community_like_blocked_relation" ? 403 : code === "comment_not_found" ? 404 : code === "like_save_failed" ? 500 : 400;
    return jsonError(code, { status, code });
  }
  return jsonOk({ liked: out.liked, like_count: out.like_count });
}
