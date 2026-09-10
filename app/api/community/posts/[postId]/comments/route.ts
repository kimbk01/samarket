import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session-require";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  findBannedWord,
  getCommunityFeedOps,
  getLatestCommentTimeForUser,
} from "@/lib/community-feed/community-ops-settings";
import { listCommunityPostComments, resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import {
  addNeighborhoodDevSampleComment,
  getNeighborhoodDevSampleCommentRows,
  getNeighborhoodDevSamplePost,
} from "@/lib/neighborhood/dev-sample-data";
import { fetchBlockedAuthorIdsForViewer } from "@/lib/neighborhood/social-filter";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
  safeErrorMessage,
} from "@/lib/http/api-route";
import { logServerPerf } from "@/lib/performance/samarket-perf";
import { bumpNotificationTarget } from "@/lib/notifications/notification-targets";
import { notifyCommunityPostCommentReceived } from "@/lib/notifications/community-social-inapp-notify";
import {
  communityAcceptanceErrorMessage,
  evaluateCommunityContentAcceptance,
} from "@/lib/community-points/content-acceptance";
import { applyCommunityPointRewardOnCommentWrite } from "@/lib/points/community-point-bridge";
import { isCommunityImportedOrigin } from "@/lib/community/community-post-origin";
import { isCommunityPostPubliclyVisible } from "@/lib/community-engine/visibility";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const startedAt = Date.now();
  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return jsonError("postId가 필요합니다.", 400);
  const id = await resolveCanonicalCommunityPostId(raw);
  if (!id) return jsonError("not_found", 404);
  const viewerUserId = await getOptionalAuthenticatedUserId();
  if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSamplePost(id)) {
    const post = getNeighborhoodDevSamplePost(id);
    if (!post) return jsonError("not_found", 404);
    const rows = getNeighborhoodDevSampleCommentRows(id);
    logServerPerf("community-comments.get", {
      postId: id,
      branch: "dev_samples",
      count: rows.length,
      elapsedMs: Date.now() - startedAt,
    });
    return jsonOk({ comments: rows, fallback: "dev_samples" });
  }
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("server_config", 500);
  }
  const { data: postRow } = await sb
    .from("community_posts")
    .select("id, user_id, status, is_deleted, is_hidden")
    .eq("id", id)
    .maybeSingle();
  const row = postRow as {
    id?: string;
    user_id?: string;
    status?: string;
    is_deleted?: boolean;
    is_hidden?: boolean;
  } | null;
  const ownerId = String(row?.user_id ?? "");
  const viewer = viewerUserId?.trim() ?? "";
  const isOwner = viewer.length > 0 && ownerId === viewer;
  // Align with like engagement: identity = community_posts.id; do not treat missing location_id as not_found.
  if (!row?.id || (!isOwner && !isCommunityPostPubliclyVisible(row))) {
    return jsonError("not_found", 404);
  }
  if (viewer.length > 0) {
    const blocked = await fetchBlockedAuthorIdsForViewer(sb, viewer);
    if (blocked.has(ownerId)) {
      return jsonError("not_found", 404);
    }
  }
  const list = await listCommunityPostComments(id, viewerUserId);
  logServerPerf("community-comments.get", {
    postId: id,
    branch: "db",
    count: list.length,
    elapsedMs: Date.now() - startedAt,
  });
  return jsonOk({ comments: list });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("server_config", 500);
  }

  const signupGate = await requireSignupCompleteForUser(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId
  );
  if (!signupGate.ok) return signupGate.response;

  const profileGate = await requireProfileFieldsForAction(
    sb as import("@supabase/supabase-js").SupabaseClient,
    auth.userId,
    "community_comment"
  );
  if (!profileGate.ok) return profileGate.response;

  const rateLimit = await enforceRateLimit({
    key: `community-comment:create:${getRateLimitKey(req, auth.userId)}`,
    limit: 12,
    windowMs: 60_000,
    message: "댓글 작성 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_comment_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return jsonError("postId가 필요합니다.", 400);

  const parsed = await parseJsonBody<{ content?: string; parentId?: string | null }>(req, "JSON 필요");
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const content = body.content?.trim();
  if (!content) return jsonError("내용을 입력하세요.", 400);
  const accepted = evaluateCommunityContentAcceptance(content, "comment");
  if (!accepted.ok) {
    return jsonError(communityAcceptanceErrorMessage(accepted.code), 400);
  }

  const ops = await getCommunityFeedOps();
  if (content.length > ops.max_comment_length) {
    return NextResponse.json(
      { ok: false, error: `댓글은 ${ops.max_comment_length}자 이하로 입력하세요.` },
      { status: 400 }
    );
  }
  if (findBannedWord(content, ops.banned_words)) {
    return jsonError("금칙어가 포함되어 있습니다.", 400);
  }

  try {
    const id = await resolveCanonicalCommunityPostId(raw);
    if (!id) return jsonError("글을 찾을 수 없습니다.", 404);
    if (process.env.NODE_ENV !== "production") {
      const post = getNeighborhoodDevSamplePost(id);
      if (post) {
        const inserted = addNeighborhoodDevSampleComment({
          postId: id,
          userId: auth.userId,
          authorName: auth.userId.slice(0, 8),
          content,
          parentId: body.parentId ?? null,
        });
        if (!inserted) return jsonError("실패", 500);
        return jsonOk({ id: inserted.id, fallback: "dev_samples" });
      }
    }
    const sbAny = sb;

    if (ops.min_comment_interval_sec > 0) {
      const lastAt = await getLatestCommentTimeForUser(auth.userId);
      if (lastAt) {
        const diffSec = (Date.now() - new Date(lastAt).getTime()) / 1000;
        if (diffSec < ops.min_comment_interval_sec) {
          return NextResponse.json(
            { ok: false, error: `댓글은 ${ops.min_comment_interval_sec}초 간격으로만 작성할 수 있습니다.` },
            { status: 429 }
          );
        }
      }
    }
    let { data: post, error: postErr } = await sb
      .from("community_posts")
      .select("id, user_id, is_deleted, status, is_hidden, origin_kind")
      .eq("id", id)
      .maybeSingle();
    if (postErr && isMissingDbColumnError(postErr, "origin_kind")) {
      ({ data: post, error: postErr } = await sb
        .from("community_posts")
        .select("id, user_id, is_deleted, status, is_hidden")
        .eq("id", id)
        .maybeSingle());
    }
    const prow = post as {
      id?: string;
      user_id?: string;
      is_deleted?: boolean;
      status?: string;
      is_hidden?: boolean;
      origin_kind?: string | null;
    } | null;
    // Same existence contract as like (`assertPostEngagementAllowed`): public visibility only.
    // Missing location_id must not fake not_found for a real community_posts.id (incl. imported).
    if (!prow?.id || !isCommunityPostPubliclyVisible(prow)) {
      return jsonError("글을 찾을 수 없습니다.", 404);
    }
    const blocked = await fetchBlockedAuthorIdsForViewer(sb, auth.userId);
    if (blocked.has(String(prow.user_id ?? ""))) {
      return jsonError("차단 관계에서는 댓글을 작성할 수 없습니다.", 403, {
        code: "community_comment_blocked_relation",
      });
    }

    const parentId = body.parentId?.trim() || null;
    let depth = 0;
    let parentCommentAuthorId: string | null = null;
    if (parentId) {
      const { data: parentRow } = await sb
        .from("community_comments")
        .select("user_id, post_id, depth")
        .eq("id", parentId)
        .maybeSingle();
      parentCommentAuthorId = String((parentRow as { user_id?: string } | null)?.user_id ?? "").trim() || null;
      const parentPostId = String((parentRow as { post_id?: string } | null)?.post_id ?? "").trim();
      if (!parentCommentAuthorId || parentPostId !== id) {
        return jsonError("답글 대상 댓글을 찾을 수 없습니다.", 404, {
          code: "community_comment_parent_not_found",
        });
      }
      if (blocked.has(parentCommentAuthorId)) {
        return jsonError("차단 관계에서는 댓글을 작성할 수 없습니다.", 403, {
          code: "community_comment_blocked_relation",
        });
      }
      const d = Number((parentRow as { depth?: number } | null)?.depth ?? 0);
      depth = Math.min(3, d + 1);
    }
    const { data: ins, error } = await sb
      .from("community_comments")
      .insert({
        post_id: id,
        user_id: auth.userId,
        content,
        parent_id: parentId,
        depth,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !ins) {
      return jsonError(safeErrorMessage(error, "댓글 저장에 실패했습니다."), 500, {
        code: "community_comment_insert_failed",
      });
    }
    const postAuthorId = String(prow.user_id ?? "").trim();
    const importedAuthor = isCommunityImportedOrigin(prow.origin_kind);
    if (postAuthorId && postAuthorId !== auth.userId && !importedAuthor) {
      void bumpNotificationTarget(sb, {
        userId: postAuthorId,
        targetType: "community_post",
        targetId: id,
        scope: "consumer",
        actorUserId: auth.userId,
      });
    }
    void notifyCommunityPostCommentReceived(sb, {
      postId: id,
      postAuthorUserId: importedAuthor ? "" : postAuthorId,
      commenterUserId: auth.userId,
      commentPreview: content,
      parentCommentAuthorUserId: parentCommentAuthorId,
    }).catch(() => {});
    const commentId = (ins as { id: string }).id;
    await applyCommunityPointRewardOnCommentWrite({
      userId: auth.userId,
      postId: id,
      commentId,
      content,
    });
    return jsonOk({ id: commentId });
  } catch (error) {
    return jsonError(safeErrorMessage(error, "댓글 저장에 실패했습니다."), 500, {
      code: "community_comment_unexpected_error",
    });
  }
}
