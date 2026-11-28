import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { assertCommunityWriteAllowed } from "@/lib/community/community-write-restriction";
import {
  deleteCommentForAuthorServer,
  updateCommentContentServer,
} from "@/lib/community/comment-mutations.server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { getNeighborhoodDevSamplePost } from "@/lib/neighborhood/dev-sample-data";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";
import { logServerPerf } from "@/lib/performance/samarket-perf";
import {
  applyCommunityPointReclaimOnCommentDelete,
  applyCommunityPointReclaimOnCommentEdit,
} from "@/lib/points/community-point-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 수정·삭제 분당 20회 (감사 L17) */
async function commentMutationRateLimit(req: NextRequest, userId: string) {
  return enforceRateLimit({
    key: `community-comment:mutate:${getRateLimitKey(req, userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "community_comment_rate_limited",
    code: "community_comment_rate_limited",
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ postId: string; commentId: string }> }
) {
  const startedAt = Date.now();
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  // 커뮤니티 활동 제한 — 댓글 작성과 동일 (CM-P2-20)
  const restricted = await assertCommunityWriteAllowed(auth.userId, "comment");
  if (restricted) return restricted;
  const patchLimit = await commentMutationRateLimit(req, auth.userId);
  if (!patchLimit.ok) return patchLimit.response;
  const { postId, commentId } = await ctx.params;
  const rawP = postId?.trim() ?? "";
  const rawC = commentId?.trim() ?? "";
  if (!rawP || !rawC) return jsonError("bad_request", { status: 400, code: "bad_request" });
  if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(rawP)) {
    return jsonOk({ ok: true, fallback: "dev_samples" });
  }
  const parsed = await parseJsonBody<{ content?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const content = parsed.value.content?.trim() ?? "";
  const id = await resolveCanonicalCommunityPostId(rawP);
  if (!id) return jsonError("not_found", { status: 404, code: "not_found" });
  const out = await updateCommentContentServer(id, rawC, auth.userId, content);
  logServerPerf("community-comment.patch", {
    postId: id,
    commentId: rawC,
    ok: out.ok,
    elapsedMs: Date.now() - startedAt,
  });
  if (!out.ok) {
    /** 코드만 — 문구는 화면이 `COMMUNITY_COMMENT_ERROR_KEYS` 로 고른다 (재감사 2026-11-27) */
    return jsonError(out.error, { status: 400, code: out.error }, out.params ? { params: out.params } : {});
  }
  await applyCommunityPointReclaimOnCommentEdit({ commentId: rawC, content });
  return jsonOk({});
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ postId: string; commentId: string }> }
) {
  const startedAt = Date.now();
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const deleteLimit = await commentMutationRateLimit(req, auth.userId);
  if (!deleteLimit.ok) return deleteLimit.response;
  const { postId, commentId } = await ctx.params;
  const rawP = postId?.trim() ?? "";
  const rawC = commentId?.trim() ?? "";
  if (!rawP || !rawC) return jsonError("bad_request", { status: 400, code: "bad_request" });
  if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(rawP)) {
    return jsonOk({ ok: true, fallback: "dev_samples" });
  }
  const id = await resolveCanonicalCommunityPostId(rawP);
  if (!id) return jsonError("not_found", { status: 404, code: "not_found" });
  const out = await deleteCommentForAuthorServer(id, rawC, auth.userId);
  logServerPerf("community-comment.delete", {
    postId: id,
    commentId: rawC,
    ok: out.ok,
    elapsedMs: Date.now() - startedAt,
  });
  if (!out.ok) {
    return jsonError(out.error, { status: 400, code: out.error });
  }
  await applyCommunityPointReclaimOnCommentDelete({ commentId: rawC });
  return jsonOk({});
}
