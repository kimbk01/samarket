import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  deleteCommentForAuthorServer,
  updateCommentContentServer,
} from "@/lib/community/comment-mutations.server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { getNeighborhoodDevSamplePost } from "@/lib/neighborhood/dev-sample-data";
import { jsonError, jsonOk, parseJsonBody, safeErrorMessage } from "@/lib/http/api-route";
import { logServerPerf } from "@/lib/performance/samarket-perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
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
    return jsonOk({ ok: true, fallback: "dev_samples" });
  }
  const parsed = await parseJsonBody<{ content?: string }>(req, "JSON 필요");
  if (!parsed.ok) return parsed.response;
  const content = parsed.value.content?.trim() ?? "";
  const id = await resolveCanonicalCommunityPostId(rawP);
  if (!id) return jsonError("not_found", 404);
  const out = await updateCommentContentServer(id, rawC, auth.userId, content);
  logServerPerf("community-comment.patch", {
    postId: id,
    commentId: rawC,
    ok: out.ok,
    elapsedMs: Date.now() - startedAt,
  });
  if (!out.ok) {
    return jsonError(safeErrorMessage({ message: out.error }, out.error), 400);
  }
  return jsonOk({});
}

export async function DELETE(
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
    return jsonOk({ ok: true, fallback: "dev_samples" });
  }
  const id = await resolveCanonicalCommunityPostId(rawP);
  if (!id) return jsonError("not_found", 404);
  const out = await deleteCommentForAuthorServer(id, rawC, auth.userId);
  logServerPerf("community-comment.delete", {
    postId: id,
    commentId: rawC,
    ok: out.ok,
    elapsedMs: Date.now() - startedAt,
  });
  if (!out.ok) {
    return jsonError(safeErrorMessage({ message: out.error }, out.error), 400);
  }
  return jsonOk({});
}
