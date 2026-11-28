import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { assertCommunityWriteAllowed } from "@/lib/community/community-write-restriction";
import { setCommentPinServer } from "@/lib/community/comment-mutations.server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /…/comments/:commentId/pin  body `{ pinned: boolean }`
 * 글 작성자만 댓글 1개 고정 (Owner 결정 1 · 설계 §6.6). 권한·상태 검사는 DB RPC 가 한 번 더 한다.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ postId: string; commentId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  /** 커뮤니티 활동 제한 — 댓글 쓰기와 같은 범위 */
  const restricted = await assertCommunityWriteAllowed(auth.userId, "comment");
  if (restricted) return restricted;
  const { postId, commentId } = await ctx.params;
  const rawP = postId?.trim() ?? "";
  const rawC = commentId?.trim() ?? "";
  if (!rawP || !rawC) return jsonError("bad_request", { status: 400, code: "bad_request" });
  const parsed = await parseJsonBody<{ pinned?: unknown }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const pinned = parsed.value.pinned;
  if (typeof pinned !== "boolean") return jsonError("bad_request", { status: 400, code: "bad_request" });
  const limit = await enforceRateLimit({
    key: `community-comment:pin:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "community_comment_rate_limited",
    code: "community_comment_rate_limited",
  });
  if (!limit.ok) return limit.response;
  const id = await resolveCanonicalCommunityPostId(rawP);
  if (!id) return jsonError("not_found", { status: 404, code: "not_found" });
  const out = await setCommentPinServer(id, rawC, auth.userId, pinned);
  if (!out.ok) {
    const status = out.error === "comment_pin_not_post_author" ? 403 : out.error === "comment_not_found" ? 404 : 400;
    return jsonError(out.error, { status, code: out.error });
  }
  return jsonOk({ pinned: out.pinned });
}
